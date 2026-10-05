/*
  Simula la actividad de los traders modelo para quien los sigue: abre y
  cierra posiciones dentro del motor real de Paper Trading (mismo
  store.createPosition/closePosition/updateUserBalance que usa la
  pantalla de Trading manual), marcadas source:'copy' para poder
  distinguirlas. No mueve dinero real ni se conecta a ningún trader de
  verdad — es la simulación explícita que se muestra en la UI.
*/
const cron = require('node-cron');
const store = require('../store');
const db = require('../db');
const market = require('./market');
const { getTrader } = require('./copyTraders');

const RISK_FRACTION = 0.02; // ~2% del saldo por posición simulada
const MAX_OPEN_PER_FOLLOW = 2;

function computePnl(position, currentPrice) {
  const direction = position.side === 'long' ? 1 : -1;
  return (currentPrice - position.entryPrice) * position.size * direction;
}

async function runCopyTradingTick() {
  const follows = await store.listAllCopyFollows();
  if (!follows.length) return;
  const prices = await market.fetchPrices().catch(() => ({}));

  for (const follow of follows) {
    const trader = getTrader(follow.traderId);
    if (!trader) continue;
    const user = await store.findUserById(follow.userId);
    if (!user) continue;

    const positions = await store.listPositions(follow.userId);
    const copiedOpen = positions
      .filter((p) => p.status === 'open' && p.source === 'copy' && p.copiedFrom === follow.traderId);

    // Con cierta probabilidad, cierra una de las posiciones copiadas abiertas.
    // Cerrar la posición y abonar el saldo van en la misma transacción, y
    // el abono usa el ajuste atómico (nunca lee-calcula-escribe) — mismo
    // motivo que en server/routes/trading.js: este job corre cada 10
    // minutos y podría solaparse con una acción manual del usuario sobre
    // su propio saldo.
    if (copiedOpen.length && Math.random() < 0.35) {
      const pos = copiedOpen[Math.floor(Math.random() * copiedOpen.length)];
      const price = prices[pos.symbol];
      if (price != null) {
        const realizedPnl = computePnl(pos, price);
        const proceeds = pos.entryPrice * pos.size + realizedPnl;
        await db.withTransaction(async (q) => {
          await store.closePosition(follow.userId, pos.id, {
            closePrice: price, closedAt: new Date().toISOString(), realizedPnl, closeReason: 'manual',
          }, q);
          await store.adjustUserBalance(follow.userId, proceeds, q);
        });
      }
      continue;
    }

    // Si le quedan huecos, puede que abra una posición nueva "siguiendo" al trader.
    if (copiedOpen.length < MAX_OPEN_PER_FOLLOW && Math.random() < 0.4) {
      const symbol = trader.symbols[Math.floor(Math.random() * trader.symbols.length)];
      const price = prices[symbol];
      if (price == null) continue;
      const fresh = await store.findUserById(follow.userId);
      const size = Number(((fresh.balance * RISK_FRACTION) / price).toFixed(6));
      const cost = price * size;
      if (!(size > 0) || cost > fresh.balance) continue;
      const side = Math.random() < 0.62 ? 'long' : 'short';
      await db.withTransaction(async (q) => {
        const updatedUser = await store.adjustUserBalance(follow.userId, -cost, q);
        if (!updatedUser) return; // saldo insuficiente de verdad (cambió entre la lectura y aquí): se omite esta ronda
        await store.createPosition({
          userId: follow.userId, symbol, side, size, entryPrice: price, costBasis: cost,
          status: 'open', openedAt: new Date().toISOString(),
          source: 'copy', copiedFrom: follow.traderId,
        }, q);
      });
    }
  }
}

function scheduleCopyTradingJob() {
  // Cada 10 minutos — suficiente para que la demo se sienta viva sin
  // generar una actividad artificial excesiva.
  cron.schedule('*/10 * * * *', () => { runCopyTradingTick().catch((e) => console.error('copyTradingJob:', e.message)); });
}

module.exports = { runCopyTradingTick, scheduleCopyTradingJob };
