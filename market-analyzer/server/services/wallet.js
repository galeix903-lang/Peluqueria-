/*
  Wallet Tracker — SIMULADO. Genera un snapshot determinista (misma
  dirección -> mismos holdings/actividad, no aleatorio en cada carga) a
  partir de un hash de la dirección, para que la demo sea coherente sin
  depender todavía de ningún proveedor on-chain real.

  Arquitectura pensada para sustituirse sin tocar la UI: el único punto de
  entrada es fetchWalletSnapshot(address). El día que haya presupuesto
  para un proveedor real (Etherscan/Alchemy/Moralis), esta función es la
  única que hay que reescribir — las rutas y el frontend no cambian.
*/
const ASSETS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP'];
const ACTIVITY_VERBS = ['compró', 'vendió', 'transfirió'];

// Hash simple y estable (no criptográfico, no hace falta) para convertir
// la dirección en una semilla numérica.
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Generador pseudoaleatorio determinista (mulberry32) — misma semilla,
// misma secuencia de "aleatorios" siempre.
function mulberry32(seed) {
  let a = seed;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FALLBACK_PRICES = { BTC: 63000, ETH: 3200, SOL: 135, BNB: 570, XRP: 0.58 };

async function fetchWalletSnapshot(address) {
  const clean = String(address).trim();
  const rand = mulberry32(hashSeed(clean.toLowerCase()));
  let prices = FALLBACK_PRICES;
  try {
    prices = { ...FALLBACK_PRICES, ...(await require('./market').fetchPrices()) };
  } catch (e) { /* nos quedamos con el fallback si algo falla */ }

  const holdingCount = 2 + Math.floor(rand() * 3); // 2-4 activos
  const shuffled = [...ASSETS].sort(() => rand() - 0.5).slice(0, holdingCount);
  const holdings = shuffled.map((symbol) => {
    const amount = Math.round(rand() * 50000) / (symbol === 'BTC' ? 1000 : symbol === 'ETH' ? 100 : 10) + 0.01;
    const price = prices[symbol] || FALLBACK_PRICES[symbol];
    return { symbol, amount: Math.round(amount * 1000) / 1000, value: Math.round(amount * price * 100) / 100 };
  }).sort((a, b) => b.value - a.value);

  const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);
  const withShare = holdings.map((h) => ({ ...h, share: totalValue > 0 ? Math.round((h.value / totalValue) * 1000) / 10 : 0 }));

  const activityCount = 3 + Math.floor(rand() * 4); // 3-6 eventos
  const now = Date.now();
  const activity = Array.from({ length: activityCount }, (_, i) => {
    const symbol = shuffled[Math.floor(rand() * shuffled.length)];
    const verb = ACTIVITY_VERBS[Math.floor(rand() * ACTIVITY_VERBS.length)];
    const amount = Math.round((rand() * 20 + 0.1) * 100) / 100;
    const daysAgo = i + Math.floor(rand() * 2);
    return {
      symbol,
      verb,
      amount,
      at: new Date(now - daysAgo * 86400000 - Math.floor(rand() * 86400000)).toISOString(),
    };
  }).sort((a, b) => b.at.localeCompare(a.at));

  return {
    address: clean,
    totalValue: Math.round(totalValue * 100) / 100,
    holdings: withShare,
    activity,
    simulated: true,
    asOf: new Date().toISOString(),
  };
}

module.exports = { fetchWalletSnapshot };
