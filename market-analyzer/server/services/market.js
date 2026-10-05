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

// Estado de calidad del dato que se sirve ahora mismo — nunca se "aparenta"
// que el precio es fresco cuando en realidad es una caché vieja o un
// fallback simulado. DATA_INVALID no se guarda como estado persistente
// (un payload inválido nunca se sirve, se descarta y se reintenta/cae al
// fallback) sino que queda registrado como motivo del último fallo.
const DATA_STATUS = {
  OK: 'DATA_OK',
  DELAYED: 'DATA_DELAYED',
  STALE: 'DATA_STALE',
  UNAVAILABLE: 'DATA_UNAVAILABLE',
  INVALID: 'DATA_INVALID',
};
// Umbrales sobre la propia CACHE_TTL_MS (30s): hasta 4x (2 min) se
// considera solo "con algo de retraso" (p.ej. CoinGecko respondiendo
// lento pero la caché previa sigue sirviendo); más de 20x (10 min) de un
// precio real sin poder refrescarlo ya es "obsoleto" de verdad.
const DELAYED_THRESHOLD_MS = CACHE_TTL_MS * 4;
const STALE_THRESHOLD_MS = CACHE_TTL_MS * 20;
let lastFetchError = null; // diagnóstico del último intento fallido (no se expone sin más como "el estado")

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

// fetch() de Node no tiene timeout por defecto — sin esto, una respuesta
// lenta de CoinGecko (no caída, solo lenta) podía dejar la petición
// colgada mucho más tiempo del razonable en vez de fallar rápido y caer
// al dato en caché/fallback.
async function fetchWithTimeout(url, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Un reintento con una pequeña espera antes de rendirse — cubre el caso
// típico de un fallo de red puntual sin machacar la API si de verdad está
// caída (en ese caso, el segundo intento falla igual de rápido y se cae
// al fallback sin más demora).
async function fetchJsonWithRetry(url, { timeoutMs = 6000, retries = 1, retryDelayMs = 400 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, timeoutMs);
      if (!response.ok) throw new Error(`CoinGecko respondió ${response.status}`);
      return await response.json();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(retryDelayMs * (attempt + 1));
    }
  }
  throw lastErr;
}

// Un payload "válido" tiene que traer al menos un precio numérico y
// positivo real — una respuesta vacía o con solo valores corruptos se
// descarta igual que un fallo de red (DATA_INVALID), nunca se sirve tal
// cual solo porque el HTTP fue 200.
function extractValidPrices(payload) {
  const prices = {};
  for (const [symbol, geckoId] of Object.entries(SYMBOL_TO_COINGECKO_ID)) {
    const value = payload?.[geckoId]?.usd;
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) prices[symbol] = value;
  }
  return prices;
}

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
    const payload = await fetchJsonWithRetry(url);
    const prices = extractValidPrices(payload);
    if (Object.keys(prices).length === 0) {
      lastFetchError = { status: DATA_STATUS.INVALID, at: now, message: 'Respuesta de CoinGecko sin ningún precio numérico válido.' };
      throw new Error(lastFetchError.message);
    }
    cache = { data: prices, fetchedAt: now, isFallback: false };
    lastFetchError = null;
    pushHistorySamples(prices, now);
    return prices;
  } catch (err) {
    if (!lastFetchError) lastFetchError = { status: DATA_STATUS.UNAVAILABLE, at: now, message: err.message };
    // Sin red hacia CoinGecko (o respuesta inválida): si había algo en
    // caché (aunque esté vencido) es más fiable que el fallback simulado;
    // si no, simulamos. `isFallback` solo es true cuando ni eso había.
    const hadRealCache = !!cache.data && !cache.isFallback;
    const prices = cache.data || simulatedFallbackPrices();
    cache = { data: prices, fetchedAt: hadRealCache ? cache.fetchedAt : now, isFallback: !hadRealCache, staleSince: hadRealCache ? (cache.staleSince || cache.fetchedAt) : null };
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

// Estado de calidad granular, pensado para que el frontend pueda explicar
// exactamente qué está viendo el usuario en vez de un simple sí/no:
// - DATA_OK: precio real, refrescado dentro de la ventana normal.
// - DATA_DELAYED: precio real, pero el último refresco fue hace un rato
//   (CoinGecko respondiendo lento/con fallos puntuales, sirviendo caché).
// - DATA_STALE: precio real bastante antiguo — llevamos mucho sin poder
//   refrescarlo, pero sigue siendo un dato real, no inventado.
// - DATA_UNAVAILABLE: no hay ningún precio real disponible ahora mismo,
//   se está sirviendo el paseo aleatorio simulado.
function getPricingStatus() {
  if (!cache.data) return { status: DATA_STATUS.UNAVAILABLE, ageMs: null, lastError: lastFetchError };
  if (cache.isFallback) return { status: DATA_STATUS.UNAVAILABLE, ageMs: null, lastError: lastFetchError };
  const age = Date.now() - (cache.staleSince || cache.fetchedAt);
  if (age < DELAYED_THRESHOLD_MS) return { status: DATA_STATUS.OK, ageMs: age, lastError: null };
  if (age < STALE_THRESHOLD_MS) return { status: DATA_STATUS.DELAYED, ageMs: age, lastError: lastFetchError };
  return { status: DATA_STATUS.STALE, ageMs: age, lastError: lastFetchError };
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

  // El volumen es secundario (se casa por cercanía de tiempo, nunca
  // imprescindible — ver nota más abajo), así que su fetch no lleva
  // reintento: si falla, las velas simplemente quedan sin volumen en vez
  // de retrasar todo el análisis por un dato que no es crítico.
  const ohlcData = await fetchJsonWithRetry(
    `https://api.coingecko.com/api/v3/coins/${geckoId}/ohlc?vs_currency=usd&days=${days}`
  );
  if (!Array.isArray(ohlcData) || ohlcData.length === 0) {
    throw new Error('CoinGecko /ohlc devolvió una respuesta vacía o con forma inesperada.');
  }
  // Validación de forma: cada vela debe traer sus 5 campos como números
  // reales — una vela corrupta no se "arregla" con un valor por defecto,
  // se descarta la respuesta entera y se cae al camino honesto (caché
  // previa o "sin datos reales disponibles").
  const wellFormed = ohlcData.every((c) => Array.isArray(c) && c.length === 5 && c.every((v) => typeof v === 'number' && Number.isFinite(v)));
  if (!wellFormed) throw new Error('CoinGecko /ohlc devolvió velas con campos no numéricos.');

  let volumeSamples = null;
  try {
    const chartData = await fetchJsonWithRetry(
      `https://api.coingecko.com/api/v3/coins/${geckoId}/market_chart?vs_currency=usd&days=${days}`,
      { retries: 0 }
    );
    volumeSamples = chartData?.total_volumes || null;
  } catch {
    volumeSamples = null;
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
  fetchPrices, getPrice, getHistory, isUsingFallbackPrices, getPricingStatus,
  getCandles, getMultiTimeframeCandles, hasRealDataFor,
  SUPPORTED_SYMBOLS: Object.keys(SYMBOL_TO_COINGECKO_ID),
  DATA_STATUS,
};
