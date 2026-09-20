/*
  Copy Trading — SIMULADO, sin fondos reales. Lista estática de "traders
  modelo" con estadísticas de ejemplo. Seguir a uno de ellos hace que
  copyTradingJob.js abra/cierre posiciones por ti dentro del motor de
  Paper Trading YA REAL (mismo store.createPosition/closePosition que usa
  la pantalla de Trading) — el efecto es real dentro del simulador, nunca
  se mueve dinero de verdad ni se conecta a ningún trader real.
*/
const TRADERS = [
  {
    id: 'nova-quant', name: 'Nova Quant', color: 'linear-gradient(135deg, #4f46e5, #7c72f0)',
    winRate: 68, pnl30d: 24.5, followersBase: 1240,
    symbols: ['BTC', 'ETH'],
    strategy: 'Sigue tendencias en BTC/ETH con gestión de riesgo ajustada.',
  },
  {
    id: 'atlas-swing', name: 'Atlas Swing', color: 'linear-gradient(135deg, #0ea5e9, #22d3ee)',
    winRate: 61, pnl30d: 15.2, followersBase: 860,
    symbols: ['SOL', 'BNB'],
    strategy: 'Operativa swing de varios días en SOL/BNB.',
  },
  {
    id: 'vertex-scalper', name: 'Vertex Scalper', color: 'linear-gradient(135deg, #f97316, #ef4444)',
    winRate: 55, pnl30d: 9.8, followersBase: 2030,
    symbols: ['XRP', 'BTC'],
    strategy: 'Entradas rápidas y frecuentes en XRP/BTC.',
  },
  {
    id: 'halo-reversal', name: 'Halo Reversal', color: 'linear-gradient(135deg, #8b5cf6, #a855f7)',
    winRate: 59, pnl30d: 18.0, followersBase: 540,
    symbols: ['ETH', 'SOL'],
    strategy: 'Busca giros en soportes y resistencias fuertes.',
  },
];

function getTrader(id) {
  return TRADERS.find((t) => t.id === id) || null;
}

module.exports = { TRADERS, getTrader };
