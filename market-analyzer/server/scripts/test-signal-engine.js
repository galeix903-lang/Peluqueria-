/*
  Pruebas del motor de análisis determinista (indicators.js + structure.js
  + signalEngine.js) con velas sintéticas — sin red, sin IA, reproducibles
  siempre igual (PRNG con semilla fija). No es una suite con framework
  (el proyecto no usa ninguno), es un script directo:

    node server/scripts/test-signal-engine.js

  Cubre los 12 escenarios pedidos en la revisión del analizador: tendencia
  alcista/bajista fuerte, lateral, ruptura alcista/bajista, falsa ruptura,
  RSI extremo, señales contradictorias, pocos datos, datos incompletos
  (sin volumen), alta y baja volatilidad.
*/
const { computeSignal } = require('../services/signalEngine');

// Mulberry32: mismo generador pseudoaleatorio con semilla que ya usa
// server/services/wallet.js — determinista, sin dependencias.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildCandles({ count, start, drift = 0, noise = 0.004, volumeBase = 1000, volumeTrend = 0, seed = 1 }) {
  const rnd = mulberry32(seed);
  const candles = [];
  let price = start;
  for (let i = 0; i < count; i++) {
    const open = price;
    const change = drift + (rnd() - 0.5) * noise * 2;
    const close = open * (1 + change);
    const wick = Math.abs(change) * 0.6 + noise * 0.3;
    const high = Math.max(open, close) * (1 + wick * rnd());
    const low = Math.min(open, close) * (1 - wick * rnd());
    const volume = Math.max(1, volumeBase * (1 + volumeTrend * i / count) * (0.7 + rnd() * 0.6));
    candles.push({ time: i, open, high, low, close, volume });
    price = close;
  }
  return candles;
}

// A diferencia de buildCandles (paseo aleatorio puro, que por pura suerte
// del ruido puede acabar "tendiendo" incluso con drift=0 — un fenómeno
// real de las series de precios, no un bug), esto genera un precio que
// oscila alrededor de un centro fijo (seno + ruido pequeño) — un rango
// lateral genuino por construcción, no por suerte del sorteo aleatorio.
function buildRangeCandles({ count, center, amplitude, noise = 0.001, volumeBase = 1000, seed = 1 }) {
  const rnd = mulberry32(seed);
  const candles = [];
  for (let i = 0; i < count; i++) {
    const wave = center + Math.sin((i / count) * Math.PI * 6) * amplitude;
    const jitter = 1 + (rnd() - 0.5) * noise * 2;
    const close = wave * jitter;
    const open = i === 0 ? close : candles[i - 1].close;
    const high = Math.max(open, close) * (1 + noise * 0.4 * rnd());
    const low = Math.min(open, close) * (1 - noise * 0.4 * rnd());
    const volume = Math.max(1, volumeBase * (0.7 + rnd() * 0.6));
    candles.push({ time: i, open, high, low, close, volume });
  }
  return candles;
}

const results = [];
function check(name, condition, detail) {
  results.push({ name, pass: !!condition, detail });
}

// 1. Tendencia alcista fuerte
{
  const candles = buildCandles({ count: 200, start: 100, drift: 0.006, noise: 0.006, volumeTrend: 0.8, seed: 1 });
  const r = computeSignal({ candles, timeframeNote: 'test' });
  check('1. Tendencia alcista fuerte → BUY', r.signal === 'BUY', JSON.stringify({ signal: r.signal, confidence: r.confidence, trend: r.trend }));
}

// 2. Tendencia bajista fuerte
{
  const candles = buildCandles({ count: 200, start: 100, drift: -0.006, noise: 0.006, volumeTrend: 0.8, seed: 2 });
  const r = computeSignal({ candles, timeframeNote: 'test' });
  check('2. Tendencia bajista fuerte → SELL', r.signal === 'SELL', JSON.stringify({ signal: r.signal, confidence: r.confidence, trend: r.trend }));
}

// 3. Mercado lateral (oscilación genuina, no un paseo aleatorio que por
// suerte se queda plano)
{
  const candles = buildRangeCandles({ count: 200, center: 100, amplitude: 4, noise: 0.0015, seed: 3 });
  const r = computeSignal({ candles, timeframeNote: 'test' });
  check('3. Mercado lateral → WAIT', r.signal === 'WAIT', JSON.stringify({ signal: r.signal, trend: r.trend, structure: r.structure }));
}

// 4. Ruptura alcista (rango genuino con niveles respetados, seguido de
// un impulso decisivo con volumen)
{
  const range = buildRangeCandles({ count: 150, center: 100, amplitude: 3, noise: 0.0015, seed: 4 });
  const breakout = buildCandles({ count: 20, start: range[range.length - 1].close, drift: 0.004, noise: 0.003, volumeBase: 2500, seed: 5 });
  const candles = [...range, ...breakout];
  const r = computeSignal({ candles, timeframeNote: 'test' });
  check('4. Ruptura alcista → BUY', r.signal === 'BUY', JSON.stringify({ signal: r.signal, confidence: r.confidence, volume: r.volume }));
}

// 5. Ruptura bajista
{
  const range = buildRangeCandles({ count: 150, center: 100, amplitude: 3, noise: 0.0015, seed: 6 });
  const breakdown = buildCandles({ count: 20, start: range[range.length - 1].close, drift: -0.004, noise: 0.003, volumeBase: 2500, seed: 7 });
  const candles = [...range, ...breakdown];
  const r = computeSignal({ candles, timeframeNote: 'test' });
  check('5. Ruptura bajista → SELL', r.signal === 'SELL', JSON.stringify({ signal: r.signal, confidence: r.confidence, volume: r.volume }));
}

// 6. Falsa ruptura: spike breve fuera de rango, sin volumen, y vuelve
{
  const range1 = buildCandles({ count: 100, start: 100, drift: 0, noise: 0.0025, seed: 8 });
  const spike = buildCandles({ count: 3, start: range1[range1.length - 1].close, drift: 0.02, noise: 0.002, volumeBase: 400, seed: 9 });
  const revert = buildCandles({ count: 60, start: spike[spike.length - 1].close * 0.97, drift: -0.0005, noise: 0.0025, seed: 10 });
  const candles = [...range1, ...spike, ...revert];
  const r = computeSignal({ candles, timeframeNote: 'test' });
  check('6. Falsa ruptura → no BUY sostenido (WAIT o confianza baja)', r.signal !== 'BUY' || r.confidence < 40, JSON.stringify({ signal: r.signal, confidence: r.confidence }));
}

// 7. RSI extremo (subida muy pronunciada y sostenida)
{
  const candles = buildCandles({ count: 200, start: 100, drift: 0.01, noise: 0.003, seed: 11 });
  const r = computeSignal({ candles, timeframeNote: 'test' });
  check('7. RSI extremo → no fuerza SELL automático', r.signal !== 'SELL', JSON.stringify({ signal: r.signal, confidence: r.confidence }));
  check('7b. RSI extremo → confianza contenida (<80)', r.confidence < 80, `confidence=${r.confidence}`);
}

// 8. Señales contradictorias: rally fuerte + retroceso moderado que ni
// rompe soporte ni tira el precio por debajo de las medias (divergencia
// clásica: estructura/tendencia todavía alcistas, momentum ya negativo).
{
  const up = buildCandles({ count: 120, start: 100, drift: 0.007, noise: 0.004, seed: 12 });
  const pull = buildCandles({ count: 30, start: up[up.length - 1].close, drift: -0.004, noise: 0.006, seed: 13 });
  const flat = buildCandles({ count: 20, start: pull[pull.length - 1].close, drift: 0.0005, noise: 0.003, seed: 14 });
  const candles = [...up, ...pull, ...flat];
  const r = computeSignal({ candles, timeframeNote: 'test' });
  check('8. Señales contradictorias → WAIT', r.signal === 'WAIT' && r.debug.contradiction, JSON.stringify({ signal: r.signal, confidence: r.confidence, debug: r.debug }));
}

// 9. Pocos datos
{
  const candles = buildCandles({ count: 12, start: 100, drift: 0.01, seed: 14 });
  const r = computeSignal({ candles, timeframeNote: 'test' });
  check('9. Pocos datos → WAIT', r.signal === 'WAIT', JSON.stringify({ signal: r.signal, confidence: r.confidence }));
  check('9b. Pocos datos → confianza baja', r.confidence <= 20, `confidence=${r.confidence}`);
}

// 10. Datos incompletos (mismas velas del escenario 1, con el volumen
// puesto a null) — la prueba aísla "¿rompe el motor sin volumen, y basta
// la confluencia de los demás factores para no perder la señal?".
{
  const candles = buildCandles({ count: 200, start: 100, drift: 0.006, noise: 0.006, volumeTrend: 0.8, seed: 1 }).map((c) => ({ ...c, volume: null }));
  const r = computeSignal({ candles, timeframeNote: 'test' });
  check('10. Sin volumen → el motor no rompe y marca volumen no disponible', r.volume === 'UNAVAILABLE', `volume=${r.volume}`);
  check('10b. Sin volumen no impide una señal si el resto confluye', r.signal === 'BUY', `signal=${r.signal}, confidence=${r.confidence}`);
}

// 11. Alta volatilidad
{
  const candles = buildCandles({ count: 200, start: 100, drift: 0.001, noise: 0.05, seed: 16 });
  const r = computeSignal({ candles, timeframeNote: 'test' });
  check('11. Alta volatilidad → risk HIGH o MEDIUM (nunca LOW)', r.risk !== 'LOW', `risk=${r.risk}`);
}

// 12. Baja volatilidad (rango muy estrecho, oscilación genuina)
{
  const candles = buildRangeCandles({ count: 200, center: 100, amplitude: 0.8, noise: 0.0008, seed: 17 });
  const r = computeSignal({ candles, timeframeNote: 'test' });
  check('12. Baja volatilidad → risk LOW', r.risk === 'LOW', `risk=${r.risk}`);
  check('12b. Baja volatilidad + rango → señal WAIT', r.signal === 'WAIT', JSON.stringify({ signal: r.signal, debug: r.debug }));
}

// Invariantes generales sobre TODOS los escenarios anteriores.
{
  const scenarios = [
    buildCandles({ count: 200, start: 100, drift: 0.006, seed: 20 }),
    buildCandles({ count: 200, start: 100, drift: -0.006, seed: 21 }),
    buildCandles({ count: 200, start: 100, drift: 0, seed: 22 }),
  ];
  let allBounded = true;
  let neverIdentical = new Set();
  for (const candles of scenarios) {
    const r = computeSignal({ candles, timeframeNote: 'test' });
    if (r.confidence < 0 || r.confidence > 95) allBounded = false;
    if (!['BUY', 'SELL', 'WAIT'].includes(r.signal)) allBounded = false;
    if (!['LOW', 'MEDIUM', 'HIGH'].includes(r.risk)) allBounded = false;
    neverIdentical.add(JSON.stringify(r.reasons));
  }
  check('13. Confianza siempre en [0,95] y signal/risk siempre válidos', allBounded);
  check('14. Determinismo: misma entrada → misma salida', (() => {
    const candles = buildCandles({ count: 200, start: 100, drift: 0.006, seed: 99 });
    const a = computeSignal({ candles, timeframeNote: 't' });
    const b = computeSignal({ candles, timeframeNote: 't' });
    return JSON.stringify(a) === JSON.stringify(b);
  })());
}

const failed = results.filter((r) => !r.pass);
for (const r of results) {
  console.log(`${r.pass ? '✓' : '✗ FALLO'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
}
console.log(`\n${results.length - failed.length}/${results.length} pruebas superadas.`);
if (failed.length) process.exit(1);
