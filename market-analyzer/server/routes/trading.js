const express = require('express');
const store = require('../store');
const db = require('../db');
const market = require('../services/market');
const asyncHandler = require('../middleware/asyncHandler');
const { sendPushToUser } = require('../services/pushNotifications');

const router = express.Router();

function computePnl(position, currentPrice) {
  const direction = position.side === 'long' ? 1 : -1;
  return (currentPrice - position.entryPrice) * position.size * direction;
}

function pnlPercent(position, pnl) {
  const costBasis = position.costBasis || position.entryPrice * position.size;
  return costBasis > 0 ? (pnl / costBasis) * 100 : 0;
}

// Liquida un cierre (manual o automático) contra el saldo del usuario —
// misma lógica en los tres sitios que pueden cerrar una posición. Marcar
// la posición como cerrada y abonar el saldo son dos escrituras que
// tienen que ser todo-o-nada: si el proceso se cayera justo entre medias,
// un fallo a mitad no debe dejar la posición cerrada sin que se haya
// liquidado el saldo (ni al revés) — por eso van en la misma transacción.
// El ajuste de saldo es además atómico en sí mismo (adjustUserBalance),
// así que es seguro aunque dos cierres del mismo usuario lleguen casi a
// la vez (p.ej. el auto-cierre por stop-loss y un cierre manual).
async function settleClose(userId, position, closePrice, closeReason) {
  const realizedPnl = computePnl(position, closePrice);
  const proceeds = position.entryPrice * position.size + realizedPnl;
  const { closed, updatedUser } = await db.withTransaction(async (q) => {
    const closed = await store.closePosition(userId, position.id, {
      closePrice,
      closedAt: new Date().toISOString(),
      realizedPnl,
      closeReason,
    }, q);
    const updatedUser = await store.adjustUserBalance(userId, proceeds, q);
    return { closed, updatedUser };
  });
  return { closed, newBalance: updatedUser.balance };
}

// Revisa las posiciones abiertas del usuario y cierra sola cualquiera que
// haya cruzado su stop-loss/take-profit, usando el último precio ya
// sondeado (misma resolución que el resto del paper trading — no hay
// datos de tick a tick, así que se liquida al precio de la muestra que
// lo cruzó, igual que haría un bróker con una orden stop en un activo de
// baja frecuencia de refresco).
async function checkAndAutoClose(userId, prices) {
  const positions = await store.listPositions(userId);
  const open = positions.filter((p) => p.status === 'open');
  for (const position of open) {
    const price = prices[position.symbol];
    if (price == null) continue;
    const isLong = position.side === 'long';
    let reason = null;
    if (position.stopLoss != null && (isLong ? price <= position.stopLoss : price >= position.stopLoss)) {
      reason = 'sl';
    } else if (position.takeProfit != null && (isLong ? price >= position.takeProfit : price <= position.takeProfit)) {
      reason = 'tp';
    }
    if (reason) {
      const { closed } = await settleClose(userId, position, price, reason);
      const label = reason === 'sl' ? 'Stop-loss' : 'Take-profit';
      const pnlTxt = closed.realizedPnl >= 0 ? `+$${closed.realizedPnl.toFixed(2)}` : `-$${Math.abs(closed.realizedPnl).toFixed(2)}`;
      sendPushToUser(userId, {
        title: `${label} ejecutado: ${position.symbol}`,
        body: `Tu posición de ${position.symbol} se cerró sola (${label}). Resultado: ${pnlTxt}.`,
        data: { type: 'position_auto_closed', positionId: position.id, reason },
      }).catch(() => {});
    }
  }
}

// Balance + posiciones abiertas/cerradas, con P&L en vivo para las abiertas.
router.get('/', asyncHandler(async (req, res) => {
  const prices = await market.fetchPrices().catch(() => ({}));
  await checkAndAutoClose(req.userId, prices);

  const user = await store.findUserById(req.userId);
  const positions = await store.listPositions(req.userId);

  const withPnl = positions.map((p) => {
    if (p.status === 'closed') {
      return { ...p, pnlPercent: pnlPercent(p, p.realizedPnl) };
    }
    const currentPrice = prices[p.symbol];
    const unrealizedPnl = currentPrice != null ? computePnl(p, currentPrice) : null;
    return {
      ...p,
      currentPrice: currentPrice ?? null,
      unrealizedPnl,
      pnlPercent: unrealizedPnl != null ? pnlPercent(p, unrealizedPnl) : null,
    };
  });

  // Estadísticas agregadas reales del propio historial de operaciones —
  // nunca una cifra de "rendimiento" inventada. Con 0 operaciones
  // cerradas, winRate es null (no 0%, que insinuaría un historial real
  // con un 0% de aciertos en vez de "todavía no hay datos").
  const closedPositions = withPnl.filter((p) => p.status === 'closed');
  const wins = closedPositions.filter((p) => (p.realizedPnl || 0) > 0).length;
  const stats = {
    totalTrades: closedPositions.length,
    winRate: closedPositions.length ? Math.round((wins / closedPositions.length) * 100) : null,
    totalRealizedPnl: closedPositions.reduce((sum, p) => sum + (p.realizedPnl || 0), 0),
  };

  res.json({
    balance: user.balance,
    positions: withPnl,
    stats,
    supportedSymbols: market.SUPPORTED_SYMBOLS,
    // Si CoinGecko no responde, market.fetchPrices() cae a precios
    // simulados con un pequeño paseo aleatorio en vez de romper la
    // pantalla — el frontend necesita saberlo para avisar de que esos
    // precios no son reales, en vez de mostrarlos como si lo fueran.
    isSimulatedPricing: market.isUsingFallbackPrices(),
    // Estado granular (DATA_OK/DATA_DELAYED/DATA_STALE/DATA_UNAVAILABLE) —
    // se añade sin tocar isSimulatedPricing, que el frontend ya consume.
    dataStatus: market.getPricingStatus(),
  });
}));

// Precios en vivo de los símbolos soportados (para el resumen de mercado
// del dashboard) — el mismo mapa que ya usa el ticket de Paper Trading,
// sin necesitar sesión de trading abierta para consultarlo.
router.get('/prices', asyncHandler(async (req, res) => {
  const prices = await market.fetchPrices().catch(() => ({}));
  // % de cambio real sobre el propio histórico corto en memoria (mismo
  // buffer que alimenta el sparkline del ticket) — nunca un cambio
  // inventado; si todavía no hay al menos 2 muestras, queda en null.
  const changes = {};
  for (const symbol of market.SUPPORTED_SYMBOLS) {
    const history = market.getHistory(symbol);
    if (history.length >= 2) {
      const first = history[0].price;
      const last = history[history.length - 1].price;
      changes[symbol] = first ? ((last - first) / first) * 100 : null;
    } else {
      changes[symbol] = null;
    }
  }
  res.json({ prices, changes, isSimulatedPricing: market.isUsingFallbackPrices(), dataStatus: market.getPricingStatus() });
}));

// Histórico corto de precio de un símbolo, para el sparkline del ticket.
router.get('/chart/:symbol', asyncHandler(async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  if (!market.SUPPORTED_SYMBOLS.includes(symbol)) {
    return res.status(404).json({ error: 'Símbolo no soportado.' });
  }
  await market.fetchPrices().catch(() => {}); // asegura al menos una muestra
  res.json({ symbol, history: market.getHistory(symbol), isSimulatedPricing: market.isUsingFallbackPrices(), dataStatus: market.getPricingStatus() });
}));

// Abrir una posición al precio actual de mercado, con stop-loss/take-profit opcionales.
router.post('/', asyncHandler(async (req, res) => {
  const { symbol, side, size, stopLoss, takeProfit, analysisId } = req.body || {};
  if (typeof symbol !== 'string' || !symbol || !['long', 'short'].includes(side) || !(Number(size) > 0)) {
    return res.status(400).json({ error: 'Faltan datos: symbol, side ("long"/"short") y size (> 0).' });
  }
  const sl = stopLoss !== undefined && stopLoss !== null && stopLoss !== '' ? Number(stopLoss) : null;
  const tp = takeProfit !== undefined && takeProfit !== null && takeProfit !== '' ? Number(takeProfit) : null;
  if (sl != null && !(sl > 0)) return res.status(400).json({ error: 'El stop-loss debe ser un precio mayor que 0.' });
  if (tp != null && !(tp > 0)) return res.status(400).json({ error: 'El take-profit debe ser un precio mayor que 0.' });

  // Si la operación viene de "Simular este escenario" en un análisis, se
  // comprueba que ese análisis es realmente del usuario antes de
  // vincularlo — nunca se confía en un id venido del cliente sin más.
  let linkedAnalysisId = null;
  if (typeof analysisId === 'string' && analysisId) {
    const analysis = await store.findAnalysisById(req.userId, analysisId);
    if (analysis) linkedAnalysisId = analysis.id;
  }

  let entryPrice;
  try {
    entryPrice = await market.getPrice(symbol);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const cost = entryPrice * Number(size);

  // Descontar el saldo y crear la posición van en la misma transacción:
  // el descuento es atómico (adjustUserBalance comprueba "balance
  // suficiente" y resta en la misma sentencia SQL, así que dos aperturas
  // a la vez del mismo usuario no pueden pisarse ni dejar saldo
  // negativo), y si por lo que sea crear la posición fallara después,
  // la transacción deshace también el descuento — nunca se queda el
  // saldo restado sin una posición real detrás.
  let position;
  try {
    position = await db.withTransaction(async (q) => {
      const updatedUser = await store.adjustUserBalance(req.userId, -cost, q);
      if (!updatedUser) {
        const err = new Error('Saldo virtual insuficiente para esta operación.');
        err.status = 400;
        throw err;
      }
      return store.createPosition({
        userId: req.userId,
        symbol: symbol.toUpperCase(),
        side,
        size: Number(size),
        entryPrice,
        costBasis: cost,
        stopLoss: sl,
        takeProfit: tp,
        status: 'open',
        analysisId: linkedAnalysisId,
        openedAt: new Date().toISOString(),
      }, q);
    });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    throw err;
  }

  res.status(201).json({ position });
}));

// Cerrar una posición al precio actual y liquidar el P&L contra el saldo.
router.post('/:id/close', asyncHandler(async (req, res) => {
  const positions = await store.listPositions(req.userId);
  const position = positions.find((p) => p.id === req.params.id);
  if (!position) return res.status(404).json({ error: 'Posición no encontrada.' });
  if (position.status === 'closed') return res.status(409).json({ error: 'Esta posición ya está cerrada.' });

  let closePrice;
  try {
    closePrice = await market.getPrice(position.symbol);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const { closed, newBalance } = await settleClose(req.userId, position, closePrice, 'manual');
  res.json({ position: closed, balance: newBalance });
}));

module.exports = router;
