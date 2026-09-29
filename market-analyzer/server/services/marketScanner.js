/*
  Market Scanner: reemplaza a "Handpicked Bets" (server/services/picksJob.js,
  ahora retirado), que le pedía a Claude una lectura "genérica pero
  plausible" de BTC/ETH SIN ningún dato de precio real — inventaba una
  lectura técnica de la nada. Esto es lo contrario: escanea en vivo los
  símbolos que Vantex sigue con datos de mercado reales (los mismos 5 de
  Paper Trading) usando el mismo motor determinista del AI Analyzer
  (server/services/signalEngine.js) — cero invención, cero LLM.

  No se persiste nada: cada llamada recalcula en vivo sobre las velas más
  recientes (cacheadas ~2 min en market.js), así que el escáner siempre
  refleja el estado actual, no una "recomendación del día" guardada.
*/
const market = require('./market');
const { computeMultiTimeframeSignal, MIN_CANDLES } = require('./signalEngine');

async function scanMarket() {
  const results = [];
  for (const symbol of market.SUPPORTED_SYMBOLS) {
    const candles = await market.getMultiTimeframeCandles(symbol);
    if (!candles.mainTrend || candles.mainTrend.length < MIN_CANDLES) continue;
    const { debug, ...signal } = computeMultiTimeframeSignal(candles);
    results.push({ symbol, ...signal });
  }
  return results;
}

module.exports = { scanMarket };
