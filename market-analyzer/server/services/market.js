/*
  Precios en vivo para el paper trading. Usa el endpoint público de
  CoinGecko (sin API key) y guarda los resultados en caché ~30s en memoria
  para no golpear el rate limit si varios usuarios consultan a la vez.
*/
const SYMBOL_TO_COINGECKO_ID = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  BNB: 'binancecoin',
  XRP: 'ripple',
};

const CACHE_TTL_MS = 30 * 1000;
let cache = { data: null, fetchedAt: 0 };

// Si CoinGecko no es alcanzable (red restringida, caído, rate limit) y no
// hay nada en caché, se usa esto en vez de romper la pantalla de trading.
// Son precios de referencia con un pequeño paseo aleatorio para que no se
// vean completamente estáticos en una demo — en cuanto la red real esté
// disponible, fetchPrices() vuelve a usar el dato en vivo automáticamente.
const FALLBACK_BASE_PRICES = { BTC: 63000, ETH: 3200, SOL: 135, BNB: 570, XRP: 0.58 };

function simulatedFallbackPrices() {
  const prices = {};
  for (const [symbol, base] of Object.entries(FALLBACK_BASE_PRICES)) {
    const jitter = 1 + (Math.random() - 0.5) * 0.01; // ±0.5%
    prices[symbol] = Math.round(base * jitter * 100) / 100;
  }
  return prices;
}

async function fetchPrices() {
  const now = Date.now();
  if (cache.data && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }

  try {
    const ids = Object.values(SYMBOL_TO_COINGECKO_ID).join(',');
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`CoinGecko respondió ${response.status}`);
    const payload = await response.json();

    const prices = {};
    for (const [symbol, geckoId] of Object.entries(SYMBOL_TO_COINGECKO_ID)) {
      if (payload[geckoId]) prices[symbol] = payload[geckoId].usd;
    }
    cache = { data: prices, fetchedAt: now, isFallback: false };
    return prices;
  } catch (err) {
    // Sin red hacia CoinGecko: si había algo en caché (aunque esté
    // vencido) es más fiable que el fallback simulado; si no, simulamos.
    const prices = cache.data || simulatedFallbackPrices();
    cache = { data: prices, fetchedAt: now, isFallback: true };
    return prices;
  }
}

async function getPrice(symbol) {
  const prices = await fetchPrices();
  const price = prices[symbol.toUpperCase()];
  if (price == null) throw new Error(`Símbolo no soportado: ${symbol}`);
  return price;
}

module.exports = { fetchPrices, getPrice, SUPPORTED_SYMBOLS: Object.keys(SYMBOL_TO_COINGECKO_ID) };
