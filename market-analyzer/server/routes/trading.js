const express = require('express');
const store = require('../store');
const market = require('../services/market');

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
// misma lógica en los tres sitios que pueden cerrar una posición.
function settleClose(user, position, closePrice, closeReason) {
  const realizedPnl = computePnl(position, closePrice);
  const closed = store.closePosition(user.id, position.id, {
    closePrice,
    closedAt: new Date().toISOString(),
    realizedPnl,
    closeReason,
  });
  const proceeds = position.entryPrice * position.size + realizedPnl;
  const newBalance = user.balance + proceeds;
  store.updateUserBalance(user.id, newBalance);
  return { closed, newBalance };
}

// Revisa las posiciones abiertas del usuario y cierra sola cualquiera que
// haya cruzado su stop-loss/take-profit, usando el último precio ya
// sondeado (misma resolución que el resto del paper trading — no hay
// datos de tick a tick, así que se liquida al precio de la muestra que
// lo cruzó, igual que haría un bróker con una orden stop en un activo de
// baja frecuencia de refresco).
async function checkAndAutoClose(userId, prices) {
  const user = store.findUserById(userId);
  const open = store.listPositions(userId).filter((p) => p.status === 'open');
  let currentUser = user;
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
      const { newBalance } = settleClose(currentUser, position, price, reason);
      currentUser = { ...currentUser, balance: newBalance };
    }
  }
}

// Balance + posiciones abiertas/cerradas, con P&L en vivo para las abiertas.
router.get('/', async (req, res) => {
  const prices = await market.fetchPrices().catch(() => ({}));
  await checkAndAutoClose(req.session.userId, prices);

  const user = store.findUserById(req.session.userId);
  const positions = store.listPositions(req.session.userId);

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

  res.json({
    balance: user.balance,
    positions: withPnl,
    supportedSymbols: market.SUPPORTED_SYMBOLS,
  });
});

// Histórico corto de precio de un símbolo, para el sparkline del ticket.
router.get('/chart/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  if (!market.SUPPORTED_SYMBOLS.includes(symbol)) {
    return res.status(404).json({ error: 'Símbolo no soportado.' });
  }
  await market.fetchPrices().catch(() => {}); // asegura al menos una muestra
  res.json({ symbol, history: market.getHistory(symbol) });
});

// Abrir una posición al precio actual de mercado, con stop-loss/take-profit opcionales.
router.post('/', async (req, res) => {
  const { symbol, side, size, stopLoss, takeProfit } = req.body || {};
  if (!symbol || !['long', 'short'].includes(side) || !(Number(size) > 0)) {
    return res.status(400).json({ error: 'Faltan datos: symbol, side ("long"/"short") y size (> 0).' });
  }
  const sl = stopLoss !== undefined && stopLoss !== null && stopLoss !== '' ? Number(stopLoss) : null;
  const tp = takeProfit !== undefined && takeProfit !== null && takeProfit !== '' ? Number(takeProfit) : null;
  if (sl != null && !(sl > 0)) return res.status(400).json({ error: 'El stop-loss debe ser un precio mayor que 0.' });
  if (tp != null && !(tp > 0)) return res.status(400).json({ error: 'El take-profit debe ser un precio mayor que 0.' });

  let entryPrice;
  try {
    entryPrice = await market.getPrice(symbol);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const user = store.findUserById(req.session.userId);
  const cost = entryPrice * Number(size);
  if (cost > user.balance) {
    return res.status(400).json({ error: 'Saldo virtual insuficiente para esta operación.' });
  }

  const position = store.createPosition({
    userId: req.session.userId,
    symbol: symbol.toUpperCase(),
    side,
    size: Number(size),
    entryPrice,
    costBasis: cost,
    stopLoss: sl,
    takeProfit: tp,
    status: 'open',
    openedAt: new Date().toISOString(),
  });
  store.updateUserBalance(req.session.userId, user.balance - cost);

  res.status(201).json({ position });
});

// Cerrar una posición al precio actual y liquidar el P&L contra el saldo.
router.post('/:id/close', async (req, res) => {
  const positions = store.listPositions(req.session.userId);
  const position = positions.find((p) => p.id === req.params.id);
  if (!position) return res.status(404).json({ error: 'Posición no encontrada.' });
  if (position.status === 'closed') return res.status(409).json({ error: 'Esta posición ya está cerrada.' });

  let closePrice;
  try {
    closePrice = await market.getPrice(position.symbol);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const user = store.findUserById(req.session.userId);
  const { closed, newBalance } = settleClose(user, position, closePrice, 'manual');
  res.json({ position: closed, balance: newBalance });
});

module.exports = router;
