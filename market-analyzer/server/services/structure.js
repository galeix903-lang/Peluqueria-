/*
  Detección de estructura de precio a partir de velas OHLCV reales:
  máximos/mínimos de swing, niveles de soporte/resistencia (agrupando
  swings cercanos, no un solo punto suelto), estructura de tendencia
  (máximos y mínimos crecientes/decrecientes) y rupturas/consolidación.
  Todo determinista — ningún valor sale de una interpretación visual.
*/

// Un máximo de swing en el índice i es el high más alto dentro de
// [i-lookback, i+lookback]; un mínimo de swing, el low más bajo. Con
// lookback=2 se filtra el ruido de una sola vela sin perder giros reales.
function findSwings(candles, lookback = 2) {
  const highs = [];
  const lows = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const windowSlice = candles.slice(i - lookback, i + lookback + 1);
    const isHigh = windowSlice.every((c) => c.high <= candles[i].high);
    const isLow = windowSlice.every((c) => c.low >= candles[i].low);
    if (isHigh) highs.push({ index: i, price: candles[i].high });
    if (isLow) lows.push({ index: i, price: candles[i].low });
  }
  return { highs, lows };
}

// Máximos y mínimos crecientes (HH/HL) = estructura alcista; decrecientes
// (LH/LL) = bajista; cualquier otra combinación = mixta/lateral. Se mira
// solo el último par de swings de cada tipo — es la lectura de estructura
// más directa y la que usa cualquier trader discrecional.
function trendStructure(swings) {
  const { highs, lows } = swings;
  if (highs.length < 2 || lows.length < 2) return 'insuficiente';
  const higherHighs = highs[highs.length - 1].price > highs[highs.length - 2].price;
  const higherLows = lows[lows.length - 1].price > lows[lows.length - 2].price;
  const lowerHighs = highs[highs.length - 1].price < highs[highs.length - 2].price;
  const lowerLows = lows[lows.length - 1].price < lows[lows.length - 2].price;
  if (higherHighs && higherLows) return 'alcista';
  if (lowerHighs && lowerLows) return 'bajista';
  return 'mixta';
}

// Agrupa swings cercanos en zonas (una resistencia real casi nunca es un
// único punto exacto, es una franja donde el precio giró varias veces).
// `tolerance` es el margen relativo para considerar dos swings "el mismo
// nivel" — 1.2% funciona razonablemente en la mayoría de timeframes.
function clusterLevels(points, tolerance = 0.012) {
  if (!points.length) return [];
  const sorted = [...points].sort((a, b) => a.price - b.price);
  const clusters = [];
  let current = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prevPrice = current[current.length - 1].price;
    if ((sorted[i].price - prevPrice) / prevPrice <= tolerance) {
      current.push(sorted[i]);
    } else {
      clusters.push(current);
      current = [sorted[i]];
    }
  }
  clusters.push(current);
  return clusters
    .map((c) => ({
      price: c.reduce((sum, p) => sum + p.price, 0) / c.length,
      touches: c.length,
    }))
    .sort((a, b) => b.touches - a.touches);
}

// Soportes = zonas construidas con swing lows por debajo del precio
// actual; resistencias = zonas con swing highs por encima. Se devuelven
// como mucho 3 de cada, las de más toques primero (niveles más
// relevantes), luego ordenadas por cercanía al precio.
function supportResistance(swings, currentPrice, maxLevels = 3) {
  const supportZones = clusterLevels(swings.lows.filter((l) => l.price < currentPrice));
  const resistanceZones = clusterLevels(swings.highs.filter((h) => h.price > currentPrice));
  const support = supportZones
    .slice(0, maxLevels * 2)
    .sort((a, b) => b.price - a.price)
    .slice(0, maxLevels)
    .map((z) => z.price);
  const resistance = resistanceZones
    .slice(0, maxLevels * 2)
    .sort((a, b) => a.price - b.price)
    .slice(0, maxLevels)
    .map((z) => z.price);
  return { support, resistance };
}

// Ruptura real = el cierre (no solo una mecha) supera un nivel por un
// margen mínimo. Se compara el precio actual contra el precio de hace
// `lookback` velas (no solo la vela anterior): un impulso de ruptura
// rara vez se detiene justo en la última vela calculada, así que mirar
// solo el paso inmediatamente anterior se pierde rupturas que ya
// llevan varias velas en marcha. `levels` son TODOS los niveles
// agrupados (sin filtrar por si quedaron por encima o por debajo del
// precio actual), porque tras una ruptura real el nivel roto queda del
// lado contrario al que tenía antes.
// Una ruptura real necesita DOS cosas, no una: (1) el precio respetó el
// nivel como frontera durante la MAYOR PARTE de todo el histórico
// disponible (no solo una ventana corta — así un mercado lateral, donde
// cada ciclo cruza el nivel en ambos sentidos por igual, nunca se
// confunde con una ruptura), y (2) las últimas velas ya están de forma
// sostenida y decisiva al otro lado, no un único cierre suelto.
function detectBreakout(candles, levels, { confirmWindow = 3, minMarginPct = 0.002, respectRatio = 0.8 } = {}) {
  if (candles.length < confirmWindow + 10 || !levels.length) return null;
  const recent = candles.slice(-confirmWindow).map((c) => c.close);
  const prior = candles.slice(0, -confirmWindow).map((c) => c.close);
  for (const level of levels) {
    const belowRatio = prior.filter((c) => c <= level).length / prior.length;
    const aboveRatio = prior.filter((c) => c >= level).length / prior.length;
    const nowAbove = recent.every((c) => c > level * (1 + minMarginPct));
    const nowBelow = recent.every((c) => c < level * (1 - minMarginPct));
    if (belowRatio >= respectRatio && nowAbove) return { type: 'alcista', level };
    if (aboveRatio >= respectRatio && nowBelow) return { type: 'bajista', level };
  }
  return null;
}

// Consolidación = el rango de las últimas `period` velas es estrecho en
// relación al ATR reciente — el precio se está moviendo poco, así que
// cualquier señal direccional en este contexto es más frágil (más
// probabilidad de whipsaw) y el motor de scoring la penaliza.
function isConsolidating(candles, atrValue, period = 10) {
  if (candles.length < period || atrValue == null) return false;
  const recent = candles.slice(-period);
  const rangeHigh = Math.max(...recent.map((c) => c.high));
  const rangeLow = Math.min(...recent.map((c) => c.low));
  const range = rangeHigh - rangeLow;
  return range < atrValue * 2.2;
}

module.exports = { findSwings, trendStructure, clusterLevels, supportResistance, detectBreakout, isConsolidating };
