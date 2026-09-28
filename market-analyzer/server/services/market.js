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

// Histórico corto en memoria (una muestra por cada refresco de caché real,
// no por cada request) — suficiente para dibujar un sparkline sin
// depender de ninguna librería de gráficos ni de datos inventados: son
// los mismos precios que ya se están sirviendo al paper trading.
const HISTORY_MAX_SAMPLES = 40;
const priceHistory = {};
function pushHistorySamples(prices, timestamp) {
  for (const [symbol, price] of Object.entries(prices)) {
    if (!priceHistory[symbol]) priceHistory[symbol] = [];
    const list = priceHistory[symbol];
    list.push({ t: timestamp, price });
    if (list.length > HISTORY_MAX_SAMPLES) list.shift();
  }
}
function getHistory(symbol) {
  return priceHistory[symbol.toUpperCase()] || [];
}

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
    pushHistorySamples(prices, now);
    return prices;
  } catch (err) {
    // Sin red hacia CoinGecko: si había algo en caché (aunque esté
    // vencido) es más fiable que el fallback simulado; si no, simulamos.
    const prices = cache.data || simulatedFallbackPrices();
    cache = { data: prices, fetchedAt: now, isFallback: true };
    pushHistorySamples(prices, now);
    return prices;
  }
}

async function getPrice(symbol) {
  const prices = await fetchPrices();
  const price = prices[symbol.toUpperCase()];
  if (price == null) throw new Error(`Símbolo no soportado: ${symbol}`);
  return price;
}

// Si CoinGecko no es alcanzable, fetchPrices() devuelve precios simulados
// sin que quien lo llama lo note — esto es lo único que permite al resto
// de la app (rutas, frontend) saber que lo que se está sirviendo ahora
// mismo no son precios reales, para avisar en vez de callarlo.
function isUsingFallbackPrices() {
  return !!cache.isFallback;
}

// ---------- Velas OHLCV reales (para el motor de análisis técnico) ----------
// A diferencia de fetchPrices() (precio puntual), esto trae velas reales
// (open/high/low/close) del endpoint /ohlc de CoinGecko — indispensable
// para calcular ATR, estructura de máximos/mínimos y soportes/
// resistencias reales, no aproximados a partir de un único precio.
// CoinGecko no ofrece volumen en /ohlc, así que se casa cada vela con la
// muestra de volumen más cercana en el tiempo de /market_chart (mismo
// activo, mismo rango) — una aproximación honesta, nunca un volumen
// inventado: si /market_chart falla, la vela simplemente no lleva volumen
// en vez de rellenarlo con un número cualquiera.
const CANDLE_CACHE_TTL_MS = 2 * 60 * 1000;
const candleCache = {}; // key: `${symbol}:${days}` -> { data, fetchedAt }

function nearestVolume(volumeSamples, timestamp) {
  if (!volumeSamples || !volumeSamples.length) return null;
  let best = null;
  let bestDiff = Infinity;
  for (const [t, v] of volumeSamples) {
    const diff = Math.abs(t - timestamp);
    if (diff < bestDiff) { bestDiff = diff; best = v; }
  }
  return best;
}

async function fetchCandlesRaw(symbol, days) {
  const geckoId = SYMBOL_TO_COINGECKO_ID[symbol.toUpperCase()];
  if (!geckoId) return null;

  const [ohlcRes, chartRes] = await Promise.all([
    fetch(`https://api.coingecko.com/api/v3/coins/${geckoId}/ohlc?vs_currency=usd&days=${days}`),
    fetch(`https://api.coingecko.com/api/v3/coins/${geckoId}/market_chart?vs_currency=usd&days=${days}`).catch(() => null),
  ]);
  if (!ohlcRes.ok) throw new Error(`CoinGecko /ohlc respondió ${ohlcRes.status}`);
  const ohlcData = await ohlcRes.json(); // [[time, open, high, low, close], ...]
  if (!Array.isArray(ohlcData) || ohlcData.length === 0) return null;

  let volumeSamples = null;
  if (chartRes && chartRes.ok) {
    const chartData = await chartRes.json();
    volumeSamples = chartData?.total_volumes || null;
  }

  return ohlcData.map(([time, open, high, low, close]) => ({
    time, open, high, low, close,
    volume: nearestVolume(volumeSamples, time),
  }));
}

async function getCandles(symbol, days) {
  const key = `${symbol.toUpperCase()}:${days}`;
  const cached = candleCache[key];
  if (cached && Date.now() - cached.fetchedAt < CANDLE_CACHE_TTL_MS) {
    return cached.data;
  }
  try {
    const candles = await fetchCandlesRaw(symbol, days);
    candleCache[key] = { data: candles, fetchedAt: Date.now() };
    return candles;
  } catch (err) {
    // Sin red hacia CoinGecko: nunca se inventan velas. Si había algo en
    // caché (aunque esté vencido) se devuelve eso; si no, null — quien
    // llama debe tratar null como "no hay datos reales disponibles" y
    // caer al camino de análisis visual, nunca simular velas.
    if (cached) return cached.data;
    return null;
  }
}

// Dos contextos de temporalidad, ambos con datos 100% reales:
// - mainTrend: velas de 4h de los últimos 30 días (~180 velas) — la
//   ventana más ancha que el /ohlc gratuito de CoinGecko da en 4h antes
//   de saltar a velas de 4 días. Usada para tendencia/estructura/ATR.
// - shortTerm: velas de 30 min de los últimos 2 días (~96 velas) — para
//   momentum/RSI/MACD de corto plazo y confirmación de entrada.
async function getMultiTimeframeCandles(symbol) {
  const [mainTrend, shortTerm] = await Promise.all([
    getCandles(symbol, 30),
    getCandles(symbol, 2),
  ]);
  return { mainTrend, shortTerm };
}

function hasRealDataFor(symbol) {
  return !!SYMBOL_TO_COINGECKO_ID[symbol?.toUpperCase()];
}

module.exports = {
  fetchPrices, getPrice, getHistory, isUsingFallbackPrices,
  getCandles, getMultiTimeframeCandles, hasRealDataFor,
  SUPPORTED_SYMBOLS: Object.keys(SYMBOL_TO_COINGECKO_ID),
};
