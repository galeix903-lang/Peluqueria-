/*
  Indicadores técnicos estándar, calculados de forma 100% determinista a
  partir de datos OHLCV reales — nunca por un LLM. Cada función es pura
  (mismos datos de entrada → mismo resultado siempre) y se puede probar
  con un array de velas sintético, sin red ni IA (ver
  server/scripts/test-signal-engine.js).

  Todas las funciones que devuelven una serie alinean el array de salida
  con el de entrada, usando `null` en las posiciones donde todavía no hay
  suficientes datos para calcular el indicador (evita desplazamientos de
  índice al comparar series).
*/

function last(series) {
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i] != null) return series[i];
  }
  return null;
}

function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

// EMA clásica: se siembra con la SMA de los primeros `period` valores y a
// partir de ahí aplica el suavizado exponencial estándar (multiplicador
// 2/(period+1)) — el método más habitual y el que usa cualquier
// plataforma de gráficos.
function ema(values, period) {
  const out = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  seed /= period;
  out[period - 1] = seed;
  let prev = seed;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

// RSI de Wilder (el estándar de facto): suavizado de Wilder sobre
// ganancias/pérdidas medias, no una media simple — así coincide con lo
// que muestra cualquier plataforma real (TradingView, brokers, etc.).
function rsi(closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return out;
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) gainSum += change; else lossSum -= change;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

// MACD estándar (12,26,9). La línea de señal es la EMA9 de la propia
// línea MACD, calculada solo sobre el tramo donde MACD ya es un número
// (no sobre los `null` iniciales), para que no se desplace.
function macd(closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const emaFast = ema(closes, fastPeriod);
  const emaSlow = ema(closes, slowPeriod);
  const macdLine = closes.map((_, i) => (emaFast[i] != null && emaSlow[i] != null ? emaFast[i] - emaSlow[i] : null));

  const firstValid = macdLine.findIndex((v) => v != null);
  const signalLine = new Array(closes.length).fill(null);
  if (firstValid !== -1) {
    const compact = macdLine.slice(firstValid).map((v) => v);
    const signalCompact = ema(compact, signalPeriod);
    signalCompact.forEach((v, i) => { signalLine[firstValid + i] = v; });
  }

  const histogram = closes.map((_, i) => (macdLine[i] != null && signalLine[i] != null ? macdLine[i] - signalLine[i] : null));
  return { macdLine, signalLine, histogram };
}

// ATR de Wilder sobre el True Range real (incluye gaps entre velas, no
// solo el rango high-low de la vela actual) — mide volatilidad en las
// mismas unidades que el precio, útil para dimensionar el riesgo.
function atr(candles, period = 14) {
  const out = new Array(candles.length).fill(null);
  if (candles.length < period + 1) return out;
  const tr = candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    return Math.max(
      c.high - c.low,
      Math.abs(c.high - candles[i - 1].close),
      Math.abs(c.low - candles[i - 1].close)
    );
  });
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += tr[i];
  let prevAtr = sum / period;
  out[period] = prevAtr;
  for (let i = period + 1; i < candles.length; i++) {
    prevAtr = (prevAtr * (period - 1) + tr[i]) / period;
    out[i] = prevAtr;
  }
  return out;
}

// Volumen relativo: volumen de la última vela frente a la media de las
// `period` anteriores. >1 significa actividad por encima de lo normal —
// se usa para confirmar (o no) rupturas, nunca para inventar un "volumen
// alto" sin dato real detrás.
function relativeVolume(volumes, period = 20) {
  if (volumes.length < period + 1) return null;
  const recent = volumes.slice(-period - 1, -1);
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  if (avg === 0) return null;
  return volumes[volumes.length - 1] / avg;
}

// Desviación estándar de los retornos porcentuales de las últimas
// `period` velas — usada para clasificar el régimen de volatilidad
// (alta/normal/baja) de forma relativa al propio histórico del activo,
// en vez de un umbral fijo arbitrario.
function returnsStdev(closes, period = 20) {
  if (closes.length < period + 1) return null;
  const slice = closes.slice(-period - 1);
  const returns = [];
  for (let i = 1; i < slice.length; i++) returns.push((slice[i] - slice[i - 1]) / slice[i - 1]);
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance);
}

module.exports = { sma, ema, rsi, macd, atr, relativeVolume, returnsStdev, last };
