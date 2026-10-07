/*
  Market Scanner: escanea en vivo los símbolos que Vantex sigue con datos
  de mercado reales (cripto mayor + memecoins — misma lista que Paper
  Trading, ver market.SUPPORTED_SYMBOLS) combinando dos fuentes, ambas
  reales y ambas ya usadas en el resto de la app:

  - El motor determinista del AI Analyzer (signalEngine.js) sobre velas
    OHLCV reales → señal, confianza, tendencia, momentum, volumen y
    volatilidad (ATR%).
  - /coins/markets de CoinGecko (market.fetchMarketStats) → precio,
    variación 24h, volumen 24h y capitalización reales.

  Cero invención, cero LLM. "Actividad" y "Estado" son una puntuación
  compuesta (0-100) calculada a partir de esas mismas señales reales
  (percentil de volumen dentro del propio escaneo + variación 24h +
  confianza/momentum) — nunca un número aleatorio ni decorativo. Los
  "Market Highlights" son, literalmente, el máximo real de cada métrica
  entre los símbolos escaneados en este momento.
*/
const market = require('./market');
const coinIcons = require('./coinIcons');
const { computeMultiTimeframeSignal, MIN_CANDLES } = require('./signalEngine');

// Misma categorización que ya usa el AI Analyzer (public/analyzer/index.html)
// y Paper Trading para distinguir memecoins del resto — centralizada aquí
// para el badge "MEMECOIN" y el filtro Crypto/Memecoins del Scanner.
const MEMECOIN_SYMBOLS = new Set(['DOGE', 'SHIB', 'PEPE', 'WIF', 'BONK']);

// Red nativa de cada token — dato enciclopédico/estático (no una métrica
// de mercado), igual de válido mostrarlo que decir "PEPE es un token
// ERC-20": no es algo que haya que "calcular", es un hecho sobre el activo.
const NETWORK_BY_SYMBOL = {
  BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', BNB: 'BNB Chain', XRP: 'XRP Ledger',
  DOGE: 'Dogecoin', SHIB: 'Ethereum', PEPE: 'Ethereum', WIF: 'Solana', BONK: 'Solana',
};

function categoryOf(symbol) {
  return MEMECOIN_SYMBOLS.has(symbol) ? 'memecoin' : 'crypto';
}

// Umbrales elegidos para repartir los 4 estados del mockup entre un
// escaneo típico (no hay un estándar de la industria para "actividad
// compuesta" — lo que importa es que salga siempre del mismo cálculo
// real, nunca de una elección manual por símbolo).
function estadoFromScore(score, momentumLabel) {
  if (score >= 75) return 'MUY_ALTA';
  if (momentumLabel === 'POSITIVE' && score >= 40) return 'MOMENTUM';
  if (score >= 55) return 'ALTA';
  return 'NORMAL';
}

async function scanMarket() {
  const symbols = market.SUPPORTED_SYMBOLS;
  const [stats, icons] = await Promise.all([
    market.fetchMarketStats(),
    coinIcons.resolveIcons(symbols),
  ]);

  const rows = [];
  for (const symbol of symbols) {
    const candles = await market.getMultiTimeframeCandles(symbol);
    if (!candles.mainTrend || candles.mainTrend.length < MIN_CANDLES) continue;
    const { debug, ...signal } = computeMultiTimeframeSignal(candles);
    const stat = stats[symbol] || null;
    const icon = icons[symbol] || null;
    rows.push({
      symbol,
      name: icon?.name || stat?.name || symbol,
      logo: icon?.logo || stat?.logo || null,
      category: categoryOf(symbol),
      network: NETWORK_BY_SYMBOL[symbol] || null,
      price: stat?.price ?? signal.price ?? null,
      change24h: stat?.change24h ?? null,
      volume24h: stat?.volume24h ?? null,
      marketCap: stat?.marketCap ?? null,
      sparkline: market.getHistory(symbol),
      ...signal,
    });
  }

  if (!rows.length) return { results: [], highlights: null };

  // Percentil de volumen DENTRO del propio escaneo (no un umbral fijo
  // global, que no tendría sentido comparando el volumen de BTC con el
  // de una memecoin — aquí solo importa quién destaca hoy, entre los
  // activos que Vantex sigue).
  const volumes = rows.map((r) => r.volume24h).filter((v) => v != null);
  const maxVolume = volumes.length ? Math.max(...volumes) : null;

  for (const r of rows) {
    const volumeScore = maxVolume && r.volume24h != null ? (r.volume24h / maxVolume) * 40 : 0;
    const changeScore = r.change24h != null ? (Math.min(Math.abs(r.change24h), 20) / 20) * 30 : 0;
    const momentumScore = (Math.min(Math.abs(r.confidence || 0), 100) / 100) * 30;
    r.activityScore = Math.round(volumeScore + changeScore + momentumScore);
    r.estado = estadoFromScore(r.activityScore, r.momentum);
  }

  const topBy = (key, filterNonNull) => {
    const candidates = filterNonNull ? rows.filter((r) => r[key] != null) : rows;
    if (!candidates.length) return null;
    const best = [...candidates].sort((a, b) => b[key] - a[key])[0];
    return { symbol: best.symbol, name: best.name, category: best.category, change24h: best.change24h, volume24h: best.volume24h, logo: best.logo };
  };

  return {
    results: rows,
    highlights: {
      activity: topBy('activityScore'),
      momentum: topBy('confidence'),
      volume: topBy('volume24h', true),
    },
  };
}

module.exports = { scanMarket };
