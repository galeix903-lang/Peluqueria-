const express = require('express');
const multer = require('multer');
const store = require('../store');
const market = require('../services/market');
const stooq = require('../services/stooq');
const { analyzeChart } = require('../services/analysisPipeline');
const { runBacktest } = require('../services/backtestEngine');
const asyncHandler = require('../middleware/asyncHandler');

// Techo de historial que se trae para el Historial completo y el Track
// Record — no "todos" en sentido estricto (no hay paginación todavía),
// pero sí suficiente para que ninguna de las dos pantallas mienta por
// cortar a los últimos 20 como hacía antes el historial.
const HISTORY_FETCH_LIMIT = 300;

// Límite diario de análisis por plan — Infinity para Pro (sin límite).
// Única fuente de verdad: tanto el gate de POST / como la cuota que lee
// el frontend en GET /history salen de aquí.
const PLAN_DAILY_LIMIT = { free: 3, plus: 15, pro: Infinity };
function dailyLimitFor(plan) {
  return PLAN_DAILY_LIMIT[plan] ?? PLAN_DAILY_LIMIT.free;
}

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB de sobra para una captura
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('El archivo debe ser una imagen.'));
    }
    cb(null, true);
  },
});

router.post('/', upload.single('image'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Sube una imagen del gráfico.' });
  }
  if (req.body.symbolHint !== undefined && typeof req.body.symbolHint !== 'string') {
    return res.status(400).json({ error: 'symbolHint no válido.' });
  }
  if (req.body.timeframe !== undefined && typeof req.body.timeframe !== 'string') {
    return res.status(400).json({ error: 'timeframe no válido.' });
  }
  const user = await store.findUserById(req.userId);
  const limit = dailyLimitFor(user.plan);
  if (Number.isFinite(limit) && (await store.countAnalysesToday(user.id)) >= limit) {
    return res.status(402).json({
      error: `Has usado tus ${limit} análisis de hoy.`,
      limitReached: true,
      plan: user.plan,
      limit,
    });
  }
  try {
    const symbolHint = (req.body.symbolHint || '').trim().slice(0, 20) || undefined;
    const timeframe = (req.body.timeframe || '').trim().slice(0, 10) || undefined;
    const analysis = await analyzeChart(req.file.buffer, req.file.mimetype, { symbolHint, timeframe });
    const record = await store.addAnalysis({
      userId: req.userId,
      createdAt: new Date().toISOString(),
      timeframe: timeframe || null,
      ...analysis,
    });
    res.json({ analysis: record });
  } catch (err) {
    console.error('Error en el analizador:', err.message);
    res.status(502).json({ error: 'No se pudo completar el análisis. Inténtalo de nuevo en unos segundos.' });
  }
}));

// Operaciones de Paper Trading abiertas a partir de este análisis
// concreto (botón "Simular este escenario") — para que su detalle pueda
// mostrar "ya abriste una operación con esto" y, si ya se cerró, el
// resultado real. Se pide solo al ver el detalle de un análisis, no en
// la lista, para no multiplicar consultas.
router.get('/:id/positions', asyncHandler(async (req, res) => {
  const analysis = await store.findAnalysisById(req.userId, req.params.id);
  if (!analysis) return res.status(404).json({ error: 'Análisis no encontrado.' });
  res.json({ positions: await store.listPositionsByAnalysisId(req.userId, analysis.id) });
}));

router.get('/history', asyncHandler(async (req, res) => {
  const user = await store.findUserById(req.userId);
  const usedToday = await store.countAnalysesToday(user.id);
  const limit = dailyLimitFor(user.plan);
  res.json({
    analyses: await store.listAnalyses(req.userId, HISTORY_FETCH_LIMIT),
    plan: user.plan,
    dailyLimit: Number.isFinite(limit) ? limit : null,
    remainingToday: Number.isFinite(limit) ? Math.max(0, limit - usedToday) : null,
  });
}));

// Track Record: compara cada análisis pasado con lo que ha pasado de
// verdad desde entonces — nunca una cifra de "precisión" inventada.
// Solo se evalúan los análisis que de verdad se pueden verificar:
//   - source === 'REAL_DATA' (el camino VISUAL no tiene un precio real
//     fiable detrás, solo una lectura aproximada de la imagen).
//   - signal BUY/SELL (WAIT no es una apuesta direccional que comparar).
//   - hay un precio actual real disponible (no en modo simulado).
// Todo lo demás se devuelve igualmente, marcado como "no evaluable" y
// con el motivo — nunca se descarta silenciosamente un análisis que no
// salió bien, ni se cuenta un análisis dos veces.
function classifyOutcome({ signal, priceThen, priceNow, invalidation }) {
  if (invalidation != null) {
    if (signal === 'BUY') {
      if (priceNow <= invalidation) return 'INVALIDATED';
      return priceNow > priceThen ? 'FAVORABLE' : 'PENDING';
    }
    if (priceNow >= invalidation) return 'INVALIDATED';
    return priceNow < priceThen ? 'FAVORABLE' : 'PENDING';
  }
  // Sin nivel de invalidación calculado (raro en REAL_DATA, pero posible
  // con muy pocos niveles de soporte/resistencia): se cae a comparar
  // solo la dirección del precio.
  if (priceNow === priceThen) return 'FLAT';
  const movedUp = priceNow > priceThen;
  const favorable = signal === 'BUY' ? movedUp : !movedUp;
  return favorable ? 'FAVORABLE' : 'UNFAVORABLE';
}

router.get('/track-record', asyncHandler(async (req, res) => {
  const analyses = await store.listAnalyses(req.userId, HISTORY_FETCH_LIMIT);
  const pricingIsSimulated = market.isUsingFallbackPrices();

  const realDataAssets = [...new Set(analyses.filter((a) => a.source === 'REAL_DATA').map((a) => a.asset))];
  const currentPrices = {};
  for (const asset of realDataAssets) {
    try {
      currentPrices[asset] = await market.getPrice(asset);
    } catch {
      currentPrices[asset] = null;
    }
  }

  const results = analyses.map((a) => {
    const base = { id: a.id, asset: a.asset, signal: a.signal, createdAt: a.createdAt, timeframe: a.timeframe || null };
    if (a.source !== 'REAL_DATA') {
      return { ...base, evaluable: false, reason: 'VISUAL_SOURCE' };
    }
    if (a.signal === 'WAIT') {
      return { ...base, evaluable: false, reason: 'NO_DIRECTIONAL_CALL', priceThen: a.price ?? null };
    }
    const priceThen = a.price;
    const priceNow = currentPrices[a.asset];
    if (priceThen == null || priceNow == null || pricingIsSimulated) {
      return { ...base, evaluable: false, reason: pricingIsSimulated ? 'PRICING_UNAVAILABLE' : 'MISSING_DATA' };
    }
    const invalidation = a.scenarios?.keyLevels?.invalidation ?? null;
    const changePct = ((priceNow - priceThen) / priceThen) * 100;
    const outcome = classifyOutcome({ signal: a.signal, priceThen, priceNow, invalidation });
    return { ...base, evaluable: true, priceThen, priceNow, changePct, invalidation, outcome };
  });

  const evaluable = results.filter((r) => r.evaluable);
  const summary = {
    total: results.length,
    evaluable: evaluable.length,
    favorable: evaluable.filter((r) => r.outcome === 'FAVORABLE').length,
    unfavorable: evaluable.filter((r) => r.outcome === 'UNFAVORABLE').length,
    invalidated: evaluable.filter((r) => r.outcome === 'INVALIDATED').length,
    pending: evaluable.filter((r) => r.outcome === 'PENDING').length,
  };

  res.json({ results, summary, isSimulatedPricing: pricingIsSimulated });
}));

// Backtest REAL del motor determinista (server/services/backtestEngine.js)
// sobre el mismo histórico real que ya usa el camino REAL_DATA del
// propio analizador — nunca datos simulados. Solo tiene sentido para
// símbolos con cobertura de datos reales (los mismos que llevan ★ en el
// selector del frontend); para cualquier otro, se dice explícitamente
// que no hay histórico real sobre el que backtestear, en vez de
// intentarlo con lo que haya.
router.get('/backtest/:symbol', asyncHandler(async (req, res) => {
  const symbol = String(req.params.symbol || '').trim().toUpperCase();
  if (!symbol) return res.status(400).json({ error: 'Falta el símbolo.' });

  let candles = null;
  let timeframeKind = 'daily';
  let sourceNote = null;
  if (market.hasRealDataFor(symbol)) {
    const data = await market.getMultiTimeframeCandles(symbol);
    candles = data.mainTrend;
    timeframeKind = '4h';
    sourceNote = 'Velas de 4h de los últimos 30 días (CoinGecko) — la ventana más amplia que da el endpoint gratuito sin API key.';
  } else if (stooq.hasRealDataFor(symbol)) {
    const data = await stooq.getMultiTimeframeCandles(symbol);
    candles = data.mainTrend;
    timeframeKind = 'daily';
    sourceNote = 'Velas diarias de cierre de los últimos ~12 meses (Stooq).';
  } else {
    return res.status(404).json({
      error: `${symbol} no tiene cobertura de datos de mercado reales en Vantex — no hay histórico verificable sobre el que backtestear (nunca se simula uno).`,
      hasRealData: false,
    });
  }

  if (!candles) {
    return res.status(502).json({
      error: `No se pudo obtener histórico real para ${symbol} en este momento (proveedor de datos no disponible). Inténtalo de nuevo en unos minutos.`,
      hasRealData: true, temporarilyUnavailable: true,
    });
  }

  const result = runBacktest(candles, { timeframeKind });
  res.json({ symbol, sourceNote, ...result });
}));

module.exports = router;
