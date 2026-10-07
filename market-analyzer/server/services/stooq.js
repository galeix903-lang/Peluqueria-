/*
  Datos reales de acciones y fondos para el AI Analyzer — Stooq (gratis,
  sin API key, igual que CoinGecko para cripto: ver server/services/
  market.js). Expone velas DIARIAS de cierre, nunca inventadas: si Stooq
  no responde o el ticker no existe, no hay datos reales y el pipeline
  cae honestamente al camino visual (mismo patrón que market.js cuando
  CoinGecko falla y no hay caché previa).

  Deliberadamente NO alimenta Paper Trading ni el Market Scanner (que sí
  usa market.SUPPORTED_SYMBOLS): esos necesitan un precio que se mueva
  mientras una posición sigue abierta o mientras se escanea el mercado,
  y Stooq sin API key solo da el cierre de la última sesión bursátil, no
  nada en vivo. Aquí solo alimenta el motor determinista del AI Analyzer,
  que ya sabe trabajar con un único timeframe (ver
  computeMultiTimeframeSignal en signalEngine.js: sin shortTerm, se queda
  con la lectura del timeframe principal sin más).
*/
const SYMBOL_TO_STOOQ_TICKER = {
  AAPL: 'aapl.us',
  SPY: 'spy.us',
};

const CANDLE_CACHE_TTL_MS = 60 * 60 * 1000; // 1h — Stooq solo cierra una vez al día, no hace falta refrescar más a menudo
const FETCH_TIMEOUT_MS = 8000;
const HISTORY_DAYS = 400; // ventana calendario amplia para tener de sobra >150 sesiones bursátiles reales

const candleCache = {}; // symbol -> { data, fetchedAt }

function hasRealDataFor(symbol) {
  return !!SYMBOL_TO_STOOQ_TICKER[symbol?.toUpperCase()];
}

function yyyymmdd(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

async function fetchDailyCandlesRaw(ticker) {
  const d2 = new Date();
  const d1 = new Date(d2.getTime() - HISTORY_DAYS * 24 * 60 * 60 * 1000);
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(ticker)}&d1=${yyyymmdd(d1)}&d2=${yyyymmdd(d2)}&i=d`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let text;
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      // Sin esta cabecera, Stooq a veces devuelve una página de error en
      // vez del CSV — con un user-agent de navegador normal responde
      // igual que por el navegador.
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VantexBot/1.0)' },
    });
    if (!res.ok) throw new Error(`Stooq respondió ${res.status}`);
    text = await res.text();
  } finally {
    clearTimeout(timer);
  }

  // Un ticker inexistente o sin cobertura no da un 404: devuelve un
  // cuerpo de una sola línea sin forma de CSV — se trata exactamente
  // igual que un fallo de red (se descarta, nunca se "arregla" con un
  // valor inventado).
  const lines = text.trim().split('\n').filter(Boolean);
  if (lines.length < 2) throw new Error('Stooq no devolvió histórico de velas para este ticker.');

  const rows = lines.slice(1).map((line) => {
    const [date, open, high, low, close, volume] = line.split(',');
    return {
      time: new Date(date).getTime(),
      open: Number(open), high: Number(high), low: Number(low), close: Number(close),
      volume: volume ? Number(volume) : null,
    };
  }).filter((c) => Number.isFinite(c.time) && [c.open, c.high, c.low, c.close].every((v) => Number.isFinite(v) && v > 0));

  if (!rows.length) throw new Error('Stooq devolvió filas sin precios numéricos válidos.');
  return rows;
}

async function getDailyCandles(symbol) {
  const ticker = SYMBOL_TO_STOOQ_TICKER[symbol.toUpperCase()];
  if (!ticker) return null;
  const cached = candleCache[symbol];
  if (cached && Date.now() - cached.fetchedAt < CANDLE_CACHE_TTL_MS) return cached.data;
  try {
    const candles = await fetchDailyCandlesRaw(ticker);
    candleCache[symbol] = { data: candles, fetchedAt: Date.now() };
    return candles;
  } catch (err) {
    // Sin red hacia Stooq: una caché vencida sigue siendo más fiable que
    // nada (mismo criterio que market.js con las velas de cripto).
    if (cached) return cached.data;
    return null;
  }
}

// Misma forma que market.getMultiTimeframeCandles({mainTrend, shortTerm})
// para que analysisPipeline.js pueda tratar ambos proveedores igual —
// shortTerm siempre null porque Stooq gratis no da intradía; el motor de
// señales ya sabe operar solo con el timeframe principal en ese caso.
async function getMultiTimeframeCandles(symbol) {
  const mainTrend = await getDailyCandles(symbol);
  return { mainTrend, shortTerm: null };
}

module.exports = {
  hasRealDataFor,
  getMultiTimeframeCandles,
  SUPPORTED_SYMBOLS: Object.keys(SYMBOL_TO_STOOQ_TICKER),
};
