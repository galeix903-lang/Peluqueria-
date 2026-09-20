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
const market = require('./market');
const { getTrader } = require('./copyTraders');

const RISK_FRACTION = 0.02; // ~2% del saldo por posición simulada
const MAX_OPEN_PER_FOLLOW = 2;

function computePnl(position, currentPrice) {
  const direction = position.side === 'long' ? 1 : -1;
  return (currentPrice - position.entryPrice) * position.size * direction;
}

async function runCopyTradingTick() {
  const follows = store.listAllCopyFollows();
  if (!follows.length) return;
  const prices = await market.fetchPrices().catch(() => ({}));

  for (const follow of follows) {
    const trader = getTrader(follow.traderId);
    if (!trader) continue;
    const user = store.findUserById(follow.userId);
    if (!user) continue;

    const copiedOpen = store.listPositions(follow.userId)
      .filter((p) => p.status === 'open' && p.source === 'copy' && p.copiedFrom === follow.traderId);

    // Con cierta probabilidad, cierra una de las posiciones copiadas abiertas.
    if (copiedOpen.length && Math.random() < 0.35) {
      const pos = copiedOpen[Math.floor(Math.random() * copiedOpen.length)];
      const price = prices[pos.symbol];
      if (price != null) {
        const realizedPnl = computePnl(pos, price);
        store.closePosition(follow.userId, pos.id, {
          closePrice: price, closedAt: new Date().toISOString(), realizedPnl, closeReason: 'manual',
        });
        const fresh = store.findUserById(follow.userId);
        store.updateUserBalance(follow.userId, fresh.balance + pos.entryPrice * pos.size + realizedPnl);
      }
      continue;
    }

    // Si le quedan huecos, puede que abra una posición nueva "siguiendo" al trader.
    if (copiedOpen.length < MAX_OPEN_PER_FOLLOW && Math.random() < 0.4) {
      const symbol = trader.symbols[Math.floor(Math.random() * trader.symbols.length)];
      const price = prices[symbol];
      if (price == null) continue;
      const fresh = store.findUserById(follow.userId);
      const size = Number(((fresh.balance * RISK_FRACTION) / price).toFixed(6));
      const cost = price * size;
      if (!(size > 0) || cost > fresh.balance) continue;
      const side = Math.random() < 0.62 ? 'long' : 'short';
      store.createPosition({
        userId: follow.userId, symbol, side, size, entryPrice: price, costBasis: cost,
        status: 'open', openedAt: new Date().toISOString(),
        source: 'copy', copiedFrom: follow.traderId,
      });
      store.updateUserBalance(follow.userId, fresh.balance - cost);
    }
  }
}

function scheduleCopyTradingJob() {
  // Cada 10 minutos — suficiente para que la demo se sienta viva sin
  // generar una actividad artificial excesiva.
  cron.schedule('*/10 * * * *', () => { runCopyTradingTick().catch((e) => console.error('copyTradingJob:', e.message)); });
}

module.exports = { runCopyTradingTick, scheduleCopyTradingJob };
