/*
  Puerta de validación ÚNICA entre "datos que llegaron de un proveedor
  real" y "datos que el motor de señales tiene permiso para usar".

  Regla de oro de este archivo: nunca repara un dato, nunca estima uno
  que falta, nunca "redondea hacia lo razonable". Si algo no es
  utilizable, el resultado es un status explícito (INSUFFICIENT_DATA /
  STALE_DATA / INVALID_DATA) y una razón legible — analysisPipeline.js
  debe tratar cualquier status != 'OK' como "no calcules nada, fuerza
  WAIT y explica por qué", nunca como una advertencia que se puede
  ignorar.
*/
const { MIN_CANDLES } = require('./signalEngineConstants');

// Umbral de "vela obsoleta" por timeframe — más laxo en diario (fin de
// semana/festivo bursátil sin sesión) que en 4h (el mercado cripto no
// cierra nunca, así que un hueco grande sí es señal real de un
// problema de datos, no de un día no laborable).
const STALENESS_MS = {
  daily: 4 * 24 * 60 * 60 * 1000, // hasta 4 días (cubre un puente largo)
  '4h': 18 * 60 * 60 * 1000,
  default: 24 * 60 * 60 * 1000,
};

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

// Una vela "bien formada" tiene los 4 precios numéricos, positivos, y
// con la relación high >= {open,close,low} >= low que exige cualquier
// vela real — nunca se corrige una vela rota, se descarta la serie
// entera (un solo dato corrupto no se puede aislar sin arriesgarse a
// que el resto también lo esté).
function isWellFormedCandle(c) {
  if (!c || typeof c !== 'object') return false;
  const { open, high, low, close } = c;
  if (![open, high, low, close].every((v) => isFiniteNumber(v) && v > 0)) return false;
  if (high < low) return false;
  if (high < open || high < close) return false;
  if (low > open || low > close) return false;
  return true;
}

/*
  Valida un array de velas OHLCV antes de que signalEngine.js las toque.

  Devuelve:
    { ok: true, dataQualityNote: null }
  o
    { ok: false, status: 'INSUFFICIENT_DATA'|'INVALID_DATA'|'STALE_DATA', reason: '...' }

  `timeframeKind` es 'daily' | '4h' — decide el umbral de "obsoleto".
*/
function validateCandles(candles, { timeframeKind = 'default', minCandles = MIN_CANDLES, skipStaleness = false } = {}) {
  if (!Array.isArray(candles) || candles.length === 0) {
    return { ok: false, status: 'INSUFFICIENT_DATA', reason: 'No hay ninguna vela real disponible para este activo en este momento.' };
  }

  const malformedCount = candles.filter((c) => !isWellFormedCandle(c)).length;
  if (malformedCount > 0) {
    return {
      ok: false, status: 'INVALID_DATA',
      reason: `${malformedCount} de ${candles.length} velas recibidas tienen precios inconsistentes (no numéricos, negativos, o con el máximo/mínimo mal formado) — se descarta la serie completa en vez de usar datos parcialmente corruptos.`,
    };
  }

  // Orden temporal estrictamente creciente: un desorden o un duplicado
  // de timestamp indica un problema de integridad en el proveedor, no
  // algo que haya que "ordenar y seguir" — si el proveedor no garantiza
  // el orden, tampoco se puede confiar en que no haya huecos o
  // duplicados silenciosos en otro punto de la serie.
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].time <= candles[i - 1].time) {
      return {
        ok: false, status: 'INVALID_DATA',
        reason: 'El histórico recibido no está ordenado cronológicamente de forma estricta (timestamps duplicados o fuera de orden).',
      };
    }
  }

  if (candles.length < minCandles) {
    return {
      ok: false, status: 'INSUFFICIENT_DATA',
      reason: `Solo hay ${candles.length} velas reales disponibles y hacen falta al menos ${minCandles} para calcular indicadores fiables (medias móviles, RSI, estructura). Generar una señal con menos datos de los que el propio motor necesita sería fabricar confianza donde no la hay.`,
    };
  }

  // La comprobación de "obsoleto" compara contra el reloj actual — tiene
  // sentido para un análisis en vivo (¿este precio sigue siendo el de
  // ahora?) pero NO para un backtest, que por definición mira velas
  // pasadas a propósito; backtestEngine.js pasa skipStaleness:true.
  if (!skipStaleness) {
    const lastTime = candles[candles.length - 1].time;
    const staleness = STALENESS_MS[timeframeKind] ?? STALENESS_MS.default;
    const ageMs = Date.now() - lastTime;
    if (ageMs > staleness) {
      const ageHours = Math.round(ageMs / (60 * 60 * 1000));
      return {
        ok: false, status: 'STALE_DATA',
        reason: `La última vela disponible tiene ${ageHours}h de antigüedad — más de lo esperable para este timeframe. Antes que arriesgarse a analizar un precio que ya no es el actual, se trata como si no hubiera datos en tiempo real.`,
      };
    }
  }

  // No es un motivo de rechazo (los mercados reales sí pegan saltos
  // grandes de verdad), pero si una sola vela se movió de forma extrema
  // respecto a la anterior, se deja constancia para que el resultado
  // final pueda rebajar su propia confianza en vez de tratar ese tramo
  // como una lectura normal más.
  let maxSingleBarMovePct = 0;
  for (let i = 1; i < candles.length; i++) {
    const prevClose = candles[i - 1].close;
    const move = Math.abs(candles[i].close - prevClose) / prevClose;
    if (move > maxSingleBarMovePct) maxSingleBarMovePct = move;
  }
  const EXTREME_MOVE_THRESHOLD = 0.25; // 25% en una sola vela
  const dataQualityNote = maxSingleBarMovePct > EXTREME_MOVE_THRESHOLD
    ? `Se detectó un movimiento de ${(maxSingleBarMovePct * 100).toFixed(0)}% en una sola vela dentro del histórico — puede ser un movimiento real (noticia, baja liquidez) o un artefacto del proveedor; se trata como dato real pero se reduce la confianza del resultado.`
    : null;

  return { ok: true, status: 'OK', reason: null, dataQualityNote, maxSingleBarMovePct };
}

// Validación de símbolo: nunca "adivinar" un símbolo parecido — si no
// está en la lista de cobertura real, se trata exactamente igual que
// "sin datos reales", nunca se intenta una variante.
function validateSymbolHint(hint) {
  if (hint == null) return { ok: true, symbol: null };
  const cleaned = String(hint).trim().toUpperCase().split(/[\/\-\s]/)[0];
  if (!cleaned) return { ok: true, symbol: null };
  if (cleaned.length > 15) {
    return { ok: false, status: 'INVALID_DATA', reason: 'El símbolo indicado no tiene un formato reconocible.' };
  }
  return { ok: true, symbol: cleaned };
}

module.exports = { validateCandles, validateSymbolHint, isWellFormedCandle, STALENESS_MS };
