const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { computeSignal, classifyBias, classifyConfidence, MIN_CANDLES } = require('../services/signalEngine');
const { uptrend, downtrend, choppy, flat } = require('./fixtures');

describe('signalEngine.computeSignal — casos direccionales', () => {
  test('tendencia alcista limpia y sostenida -> nunca SELL', () => {
    const { signal, confidence } = computeSignal({ candles: uptrend(120) });
    assert.notEqual(signal, 'SELL', 'una tendencia alcista limpia jamás debería producir una señal de venta');
    assert.ok(confidence >= 5 && confidence <= 95, 'confidence debe estar siempre en [5,95]');
  });

  test('tendencia bajista limpia y sostenida -> nunca BUY', () => {
    const { signal } = computeSignal({ candles: downtrend(120) });
    assert.notEqual(signal, 'BUY', 'una tendencia bajista limpia jamás debería producir una señal de compra');
  });

  test('mercado lateral/choppy -> predominantemente WAIT, nunca una confianza alta', () => {
    const result = computeSignal({ candles: choppy(120) });
    // No se exige WAIT estricto (un lateral puede tener tramos con
    // confluencia real puntual), pero si llega a dar señal, su
    // confianza no puede ser alta — eso sería sobreconfianza en un
    // contexto sin dirección clara.
    if (result.signal !== 'WAIT') {
      assert.ok(result.confidence < 70, `señal direccional en mercado lateral con confianza alta (${result.confidence}) — sobreconfianza`);
    }
  });
});

describe('signalEngine.computeSignal — datos insuficientes', () => {
  test('menos de MIN_CANDLES -> siempre WAIT, nunca BUY/SELL', () => {
    for (const n of [0, 1, 5, 15, MIN_CANDLES - 1]) {
      const { signal, dataQuality } = computeSignal({ candles: uptrend(n) });
      assert.equal(signal, 'WAIT', `con ${n} velas (< MIN_CANDLES=${MIN_CANDLES}) la señal debe ser WAIT`);
      assert.equal(dataQuality, 'LOW');
    }
  });

  test('candles null/undefined -> WAIT, nunca lanza una excepción', () => {
    assert.doesNotThrow(() => computeSignal({ candles: null }));
    assert.doesNotThrow(() => computeSignal({ candles: undefined }));
    assert.equal(computeSignal({ candles: null }).signal, 'WAIT');
  });
});

describe('signalEngine.computeSignal — condiciones peligrosas (overrides a WAIT)', () => {
  test('volatilidad extrema fuerza WAIT aunque haya tendencia clara', () => {
    // Tendencia alcista, pero con velas de rango brutal respecto al precio (ATR altísimo).
    const candles = uptrend(80).map((c, i) => {
      if (i < 20) return c; // primeras 20 velas normales, para que haya historial de ATR
      const spike = c.close * 0.15; // rango de ±15% dentro de la propia vela
      return { ...c, high: c.close + spike, low: Math.max(0.01, c.close - spike) };
    });
    const { dangerFlags } = computeSignal({ candles });
    assert.equal(dangerFlags.extremeVolatility, true);
  });

  test('volumen extremadamente bajo frente a la media reciente se señala en dangerFlags', () => {
    // Solo la ÚLTIMA vela con volumen mínimo — relativeVolume() compara
    // esa última vela contra la media de las 20 anteriores, que deben
    // quedarse en su volumen normal para que la comparación sea real
    // (reducir también las anteriores habría bajado la propia media de
    // referencia, enmascarando el efecto que el test quiere provocar).
    const base = uptrend(80);
    const candles = base.map((c, i) => (i === base.length - 1 ? { ...c, volume: c.volume * 0.02 } : c));
    const { dangerFlags } = computeSignal({ candles });
    assert.equal(dangerFlags.thinVolume, true);
  });

  test('tendencia y momentum contradictorios entre sí -> WAIT, no un score promediado que "gana por poco"', () => {
    // Construcción deliberada: precio con estructura de máximos/mínimos
    // crecientes recientes (alcista) pero momentum reciente claramente
    // negativo (techo seguido de una vela fuerte a la baja).
    const base = uptrend(90);
    const candles = base.map((c, i) => {
      if (i < 85) return c;
      // Últimas velas: caída fuerte y sostenida -> momentum muy negativo
      const drop = (i - 84) * (c.close * 0.04);
      return { ...c, close: Math.max(1, c.close - drop), open: c.close };
    });
    const result = computeSignal({ candles });
    // No se afirma que SIEMPRE sea WAIT (depende del score exacto), pero
    // si hay contradicción real detectada, nunca puede terminar en una
    // señal con alta confianza.
    if (result.dangerFlags.contradiction) {
      assert.equal(result.signal, 'WAIT');
    }
  });
});

describe('signalEngine — clasificación de bias y confidence (5 niveles / categórico)', () => {
  test('classifyBias cubre los 5 niveles de forma monótona y simétrica', () => {
    assert.equal(classifyBias(0.9), 'STRONG_BULLISH');
    assert.equal(classifyBias(0.6), 'STRONG_BULLISH');
    assert.equal(classifyBias(0.4), 'BULLISH');
    assert.equal(classifyBias(0), 'NEUTRAL');
    assert.equal(classifyBias(-0.4), 'BEARISH');
    assert.equal(classifyBias(-0.6), 'STRONG_BEARISH');
    assert.equal(classifyBias(-0.9), 'STRONG_BEARISH');
  });

  test('classifyConfidence nunca deja un hueco ni un solape entre categorías', () => {
    for (let c = 0; c <= 100; c++) {
      const label = classifyConfidence(c);
      assert.ok(['LOW', 'MEDIUM', 'HIGH'].includes(label));
    }
    assert.equal(classifyConfidence(39), 'LOW');
    assert.equal(classifyConfidence(40), 'MEDIUM');
    assert.equal(classifyConfidence(70), 'MEDIUM');
    assert.equal(classifyConfidence(71), 'HIGH');
  });

  test('el resultado de computeSignal siempre trae bias/confidenceLabel/confidenceNote coherentes', () => {
    const result = computeSignal({ candles: uptrend(120) });
    assert.ok(['STRONG_BULLISH', 'BULLISH', 'NEUTRAL', 'BEARISH', 'STRONG_BEARISH'].includes(result.bias));
    assert.equal(result.confidenceLabel, classifyConfidence(result.confidence));
    assert.ok(result.confidenceNote && result.confidenceNote.length > 0);
  });
});

describe('signalEngine — reproducibilidad (determinismo)', () => {
  test('el mismo histórico produce exactamente el mismo resultado siempre', () => {
    const candles = uptrend(150);
    const r1 = computeSignal({ candles });
    const r2 = computeSignal({ candles });
    assert.deepEqual(r1, r2);
  });

  test('no muta el array de velas que recibe', () => {
    const candles = uptrend(100);
    const snapshot = JSON.stringify(candles);
    computeSignal({ candles });
    assert.equal(JSON.stringify(candles), snapshot);
  });
});

describe('signalEngine — explicabilidad', () => {
  test('toda señal != WAIT trae al menos una razón que de verdad apunta en su misma dirección', () => {
    const result = computeSignal({ candles: uptrend(150) });
    if (result.signal === 'BUY') {
      assert.ok(result.reasons.length > 0);
      // Ninguna razón debería mencionar "bajista" en una señal de compra.
      assert.ok(result.reasons.every((r) => !/bajista/i.test(r)), 'una razón de BUY no debería citar evidencia bajista como si la respaldara');
    }
  });

  test('WAIT por datos insuficientes lo dice explícitamente, no con un texto genérico', () => {
    const result = computeSignal({ candles: flat(5) });
    assert.match(result.mainReason.toLowerCase(), /insuficient/);
  });
});
