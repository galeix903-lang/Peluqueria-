const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { validateCandles, validateSymbolHint } = require('../services/dataValidation');
const { uptrend } = require('./fixtures');

describe('dataValidation.validateCandles', () => {
  test('rechaza un array vacío como INSUFFICIENT_DATA', () => {
    const r = validateCandles([]);
    assert.equal(r.ok, false);
    assert.equal(r.status, 'INSUFFICIENT_DATA');
  });

  test('rechaza null/undefined como INSUFFICIENT_DATA (nunca lanza)', () => {
    assert.equal(validateCandles(null).status, 'INSUFFICIENT_DATA');
    assert.equal(validateCandles(undefined).status, 'INSUFFICIENT_DATA');
  });

  test('rechaza menos velas que el mínimo exigido', () => {
    const candles = uptrend(10);
    const r = validateCandles(candles, { minCandles: 30 });
    assert.equal(r.ok, false);
    assert.equal(r.status, 'INSUFFICIENT_DATA');
    assert.match(r.reason, /10/);
  });

  test('acepta un histórico real bien formado por encima del mínimo', () => {
    const candles = uptrend(60);
    const r = validateCandles(candles, { minCandles: 30, skipStaleness: true });
    assert.equal(r.ok, true);
    assert.equal(r.status, 'OK');
  });

  test('rechaza velas con precios no numéricos como INVALID_DATA', () => {
    const candles = uptrend(60);
    candles[10].close = 'not-a-number';
    const r = validateCandles(candles, { skipStaleness: true });
    assert.equal(r.ok, false);
    assert.equal(r.status, 'INVALID_DATA');
  });

  test('rechaza velas con precio negativo o cero', () => {
    const candles = uptrend(60);
    candles[5].low = -1;
    const r1 = validateCandles(candles, { skipStaleness: true });
    assert.equal(r1.status, 'INVALID_DATA');

    const candles2 = uptrend(60);
    candles2[5].close = 0;
    const r2 = validateCandles(candles2, { skipStaleness: true });
    assert.equal(r2.status, 'INVALID_DATA');
  });

  test('rechaza una vela donde high < low (imposible físicamente)', () => {
    const candles = uptrend(60);
    candles[20].high = 5;
    candles[20].low = 50;
    const r = validateCandles(candles, { skipStaleness: true });
    assert.equal(r.status, 'INVALID_DATA');
  });

  test('rechaza una vela donde el close queda fuera del rango high/low', () => {
    const candles = uptrend(60);
    candles[15].high = candles[15].open + 1;
    candles[15].low = candles[15].open - 1;
    candles[15].close = candles[15].high + 100; // close por encima del high: imposible
    const r = validateCandles(candles, { skipStaleness: true });
    assert.equal(r.status, 'INVALID_DATA');
  });

  test('rechaza timestamps duplicados o fuera de orden', () => {
    const candles = uptrend(60);
    candles[30].time = candles[29].time; // duplicado
    const r = validateCandles(candles, { skipStaleness: true });
    assert.equal(r.status, 'INVALID_DATA');
    assert.match(r.reason, /orden/i);
  });

  test('rechaza datos obsoletos cuando skipStaleness no está activo', () => {
    const candles = uptrend(60); // termina en 2023, muy antiguo respecto a "ahora"
    const r = validateCandles(candles, { timeframeKind: 'daily' }); // skipStaleness por defecto: false
    assert.equal(r.ok, false);
    assert.equal(r.status, 'STALE_DATA');
  });

  test('acepta datos "obsoletos" cuando skipStaleness está activo (caso backtest)', () => {
    const candles = uptrend(60);
    const r = validateCandles(candles, { timeframeKind: 'daily', skipStaleness: true });
    assert.equal(r.ok, true);
  });

  test('no modifica el array de velas que recibe (validación pura, sin efectos secundarios)', () => {
    const candles = uptrend(60);
    const snapshot = JSON.stringify(candles);
    validateCandles(candles, { skipStaleness: true });
    assert.equal(JSON.stringify(candles), snapshot);
  });

  test('marca dataQualityNote en un movimiento extremo de una sola vela, sin rechazar la serie', () => {
    const candles = uptrend(60);
    candles[40].close = candles[39].close * 3; // +200% en una vela
    candles[40].high = candles[40].close;
    const r = validateCandles(candles, { skipStaleness: true });
    assert.equal(r.ok, true); // un movimiento real, por extremo que sea, no es un motivo de rechazo
    assert.ok(r.dataQualityNote, 'debería señalar el movimiento extremo en vez de ignorarlo silenciosamente');
  });
});

describe('dataValidation.validateSymbolHint', () => {
  test('acepta un símbolo normal y lo normaliza a mayúsculas', () => {
    const r = validateSymbolHint('btc');
    assert.equal(r.ok, true);
    assert.equal(r.symbol, 'BTC');
  });

  test('acepta null (sin símbolo indicado) sin error', () => {
    const r = validateSymbolHint(null);
    assert.equal(r.ok, true);
    assert.equal(r.symbol, null);
  });

  test('rechaza un símbolo absurdamente largo', () => {
    const r = validateSymbolHint('X'.repeat(50));
    assert.equal(r.ok, false);
  });
});
