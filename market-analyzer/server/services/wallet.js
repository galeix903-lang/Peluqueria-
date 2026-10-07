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
  const market = require('./market');
  let prices = FALLBACK_PRICES;
  let marketStats = {};
  try {
    prices = { ...FALLBACK_PRICES, ...(await market.fetchPrices()) };
  } catch (e) { /* nos quedamos con el fallback si algo falla */ }
  try {
    marketStats = await market.fetchMarketStats();
  } catch (e) { /* sin variación 24h real si falla, nunca inventada */ }

  const holdingCount = 2 + Math.floor(rand() * 3); // 2-4 activos
  const shuffled = [...ASSETS].sort(() => rand() - 0.5).slice(0, holdingCount);
  const holdings = shuffled.map((symbol) => {
    const amount = Math.round(rand() * 50000) / (symbol === 'BTC' ? 1000 : symbol === 'ETH' ? 100 : 10) + 0.01;
    const price = prices[symbol] || FALLBACK_PRICES[symbol];
    // Variación 24h y sparkline: mismos datos reales (CoinGecko) que ya
    // sirven al Market Scanner y al ticket de Paper Trading — nunca un
    // porcentaje o una serie inventada. Si el dato real no está disponible
    // todavía (poco después de arrancar el servidor, o CoinGecko caído),
    // se deja en null/[] en vez de rellenarlo con algo aproximado.
    const change24h = typeof marketStats[symbol]?.change24h === 'number' ? marketStats[symbol].change24h : null;
    const sparkline = market.getHistory(symbol).slice(-20).map((p) => p.price);
    return {
      symbol,
      amount: Math.round(amount * 1000) / 1000,
      value: Math.round(amount * price * 100) / 100,
      change24h,
      sparkline,
    };
  }).sort((a, b) => b.value - a.value);

  const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);
  const withShare = holdings.map((h) => ({ ...h, share: totalValue > 0 ? Math.round((h.value / totalValue) * 1000) / 10 : 0 }));

  // Variación 24h del valor total del wallet: media de la variación de
  // cada activo ponderada por su peso real en el valor total — solo con
  // los activos que sí tienen un change24h real; si ninguno lo tiene,
  // honestamente null (nunca 0% disfrazado de dato real).
  const withChange = withShare.filter((h) => h.change24h != null && h.value > 0);
  const totalChange24h = withChange.length
    ? Math.round((withChange.reduce((sum, h) => sum + h.change24h * h.value, 0) / withChange.reduce((sum, h) => sum + h.value, 0)) * 100) / 100
    : null;

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
    change24h: totalChange24h,
    holdings: withShare,
    activity,
    simulated: true,
    asOf: new Date().toISOString(),
  };
}

module.exports = { fetchWalletSnapshot };
