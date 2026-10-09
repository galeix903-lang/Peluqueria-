/*
  Generadores de velas OHLCV SINTÉTICAS para los tests — deterministas
  (mismo input -> mismo output siempre, sin Math.random sin semilla) para
  que un test que falla hoy siga fallando igual mañana. Nunca se usan
  fuera de server/test/: la app en sí nunca ve ni genera una vela
  sintética (ver dataValidation.js / signalEngine.js / backtestEngine.js,
  que solo trabajan con velas que llegaron de un proveedor real).
*/
const DAY_MS = 24 * 60 * 60 * 1000;

function seededRandom(seed) {
  let s = seed;
  return function next() {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function buildCandle(time, open, close, rand) {
  const high = Math.max(open, close) + rand() * Math.abs(close - open || 1) * 0.3;
  const low = Math.min(open, close) - rand() * Math.abs(close - open || 1) * 0.3;
  return { time, open, high: Math.max(high, open, close), low: Math.min(low, open, close), close, volume: 800 + rand() * 600 };
}

// Tendencia alcista limpia y sostenida — debe producir mayoritariamente
// BUY (o como mínimo nunca SELL) en el motor de señales.
function uptrend(n, { seed = 1, startTime = Date.UTC(2023, 0, 1), drift = 0.35 } = {}) {
  const rand = seededRandom(seed);
  const candles = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    const open = price;
    const noise = (rand() - 0.5) * 1.2;
    price = Math.max(1, price + drift + noise);
    candles.push(buildCandle(startTime + i * DAY_MS, open, price, rand));
  }
  return candles;
}

// Tendencia bajista limpia — espejo de uptrend.
function downtrend(n, { seed = 2, startTime = Date.UTC(2023, 0, 1), drift = 0.35 } = {}) {
  const rand = seededRandom(seed);
  const candles = [];
  let price = 200;
  for (let i = 0; i < n; i++) {
    const open = price;
    const noise = (rand() - 0.5) * 1.2;
    price = Math.max(1, price - drift + noise);
    candles.push(buildCandle(startTime + i * DAY_MS, open, price, rand));
  }
  return candles;
}

// Lateral puro: oscila en rango sin tendencia neta — el motor debe
// quedarse mayoritariamente en WAIT (o, si opera, debe ser raro y sin
// ventaja clara), nunca una confluencia alcista/bajista sostenida.
function choppy(n, { seed = 3, startTime = Date.UTC(2023, 0, 1), amplitude = 3 } = {}) {
  const rand = seededRandom(seed);
  const candles = [];
  for (let i = 0; i < n; i++) {
    const osc = Math.sin(i * 0.5) * amplitude;
    const price = 100 + osc + (rand() - 0.5) * 0.5;
    const open = i === 0 ? price : candles[i - 1].close;
    candles.push(buildCandle(startTime + i * DAY_MS, open, price, rand));
  }
  return candles;
}

// Precio completamente plano (cero volatilidad real) — caso límite para
// ATR/consolidación.
function flat(n, { startTime = Date.UTC(2023, 0, 1), price = 100 } = {}) {
  const candles = [];
  for (let i = 0; i < n; i++) {
    candles.push({ time: startTime + i * DAY_MS, open: price, high: price + 0.01, low: price - 0.01, close: price, volume: 500 });
  }
  return candles;
}

module.exports = { uptrend, downtrend, choppy, flat, seededRandom, DAY_MS };
