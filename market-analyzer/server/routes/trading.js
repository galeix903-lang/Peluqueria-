const express = require('express');
const store = require('../store');
const market = require('../services/market');

const router = express.Router();

function computePnl(position, currentPrice) {
  const direction = position.side === 'long' ? 1 : -1;
  return (currentPrice - position.entryPrice) * position.size * direction;
}

// Balance + posiciones abiertas/cerradas, con P&L en vivo para las abiertas.
router.get('/', async (req, res) => {
  const user = store.findUserById(req.session.userId);
  const positions = store.listPositions(req.session.userId);
  const prices = await market.fetchPrices().catch(() => ({}));

  const withPnl = positions.map((p) => {
    if (p.status === 'closed') return p;
    const currentPrice = prices[p.symbol];
    return {
      ...p,
      currentPrice: currentPrice ?? null,
      unrealizedPnl: currentPrice != null ? computePnl(p, currentPrice) : null,
    };
  });

  res.json({
    balance: user.balance,
    positions: withPnl,
    supportedSymbols: market.SUPPORTED_SYMBOLS,
  });
});

// Abrir una posición al precio actual de mercado.
router.post('/', async (req, res) => {
  const { symbol, side, size } = req.body || {};
  if (!symbol || !['long', 'short'].includes(side) || !(Number(size) > 0)) {
    return res.status(400).json({ error: 'Faltan datos: symbol, side ("long"/"short") y size (> 0).' });
  }

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

  const realizedPnl = computePnl(position, closePrice);
  const closed = store.closePosition(req.session.userId, position.id, {
    closePrice,
    closedAt: new Date().toISOString(),
    realizedPnl,
  });

  const user = store.findUserById(req.session.userId);
  const proceeds = position.entryPrice * position.size + realizedPnl;
  store.updateUserBalance(req.session.userId, user.balance + proceeds);

  res.json({ position: closed, balance: user.balance + proceeds });
});

module.exports = router;
