const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { runBacktest, simulateTrades, computeMetrics, buyAndHoldBenchmark, MIN_TRADES_RELIABLE } = require('../services/backtestEngine');
const { uptrend, downtrend, choppy, flat } = require('./fixtures');

describe('backtestEngine — GARANTÍA DE CERO LOOK-AHEAD BIAS', () => {
  // Esta es la prueba más importante de todo el motor: si una operación
  // decidida en el pasado cambiara al modificar datos FUTUROS que en su
  // momento no existían, el backtest estaría haciendo trampa (mirando
  // al futuro). Se mutan las velas a partir de un punto M y se comprueba
  // que TODAS las operaciones cuyo entryIndex es anterior a M quedan
  // exactamente igual, byte a byte, en ambas corridas.
  test('mutar velas futuras no cambia ninguna operación decidida antes de ese punto', () => {
    const original = uptrend(200, { seed: 7 });
    const M = 150;
    const mutated = original.map((c, i) => {
      if (i < M) return { ...c };
      // A partir de M: un desplome violento y aleatorio, lo más distinto
      // posible del original, para maximizar la posibilidad de detectar
      // cualquier fuga de información del futuro.
      return { ...c, open: 1, high: 1.5, low: 0.5, close: 0.9 + (i % 7) * 0.3, volume: 50000 };
    });

    const tradesOriginal = simulateTrades(original);
    const tradesMutated = simulateTrades(mutated);

    const pastOriginal = tradesOriginal.filter((t) => t.entryIndex < M);
    const pastMutated = tradesMutated.filter((t) => t.entryIndex < M);

    assert.equal(pastOriginal.length, pastMutated.length, 'el número de operaciones decididas antes de M no debería cambiar al mutar datos después de M');
    for (let i = 0; i < pastOriginal.length; i++) {
      assert.deepEqual(
        { side: pastOriginal[i].side, entryIndex: pastOriginal[i].entryIndex, entryPrice: pastOriginal[i].entryPrice, entryTime: pastOriginal[i].entryTime },
        { side: pastMutated[i].side, entryIndex: pastMutated[i].entryIndex, entryPrice: pastMutated[i].entryPrice, entryTime: pastMutated[i].entryTime },
        `la operación #${i} decidida antes del punto de mutación cambió — esto significaría que el motor está mirando datos futuros`
      );
    }
  });

  test('la señal en el paso i se calcula solo con candles[0..i] — ejecución siempre en candles[i+1].open, nunca en el close de la propia vela de la señal', () => {
    const candles = uptrend(80, { seed: 11 });
    const trades = simulateTrades(candles);
    assert.ok(trades.length > 0, 'la fixture debería generar al menos una operación para que este test compruebe algo');
    for (const t of trades) {
      // El precio y el timestamp de entrada deben coincidir EXACTAMENTE
      // con el open/time de la vela en su propio índice de entrada — si
      // coincidieran con un close, o con otra vela, sería indicio de
      // mirar "un paso de más" hacia delante o hacia atrás.
      const candleAtEntry = candles[t.entryIndex];
      assert.ok(candleAtEntry, 'entryIndex debe apuntar a una vela real dentro del array');
      assert.equal(t.entryPrice, candleAtEntry.open);
      assert.equal(t.entryTime, candleAtEntry.time);
    }
  });
});

describe('backtestEngine — validación previa (nunca backtestea datos que no pasarían el análisis en vivo)', () => {
  test('rechaza un histórico demasiado corto para el doble de MIN_CANDLES', () => {
    const r = runBacktest(uptrend(50));
    assert.equal(r.ok, false);
    assert.equal(r.status, 'INSUFFICIENT_DATA');
    assert.equal(r.trades.length, 0);
  });

  test('rechaza velas malformadas exactamente igual que dataValidation', () => {
    const candles = uptrend(200);
    candles[100].close = NaN;
    const r = runBacktest(candles);
    assert.equal(r.ok, false);
    assert.equal(r.status, 'INVALID_DATA');
  });

  test('ignora la obsolescencia de los datos (un backtest mira histórico a propósito)', () => {
    const candles = uptrend(200); // termina muy en el pasado respecto a "ahora"
    const r = runBacktest(candles);
    assert.equal(r.ok, true, 'un backtest nunca debería rechazarse solo porque las velas son viejas');
  });
});

describe('backtestEngine — honestidad del resultado (nunca fabrica operaciones ni infla la muestra)', () => {
  test('mercado totalmente plano -> cero operaciones, reportado explícitamente, no un error', () => {
    const r = runBacktest(flat(200));
    assert.equal(r.ok, true);
    assert.equal(r.overall.totalTrades, 0);
    assert.equal(r.overall.winRate, null);
    assert.equal(r.overall.statisticallyReliable, false);
    assert.match(r.overall.note, /no generó ninguna operación/);
  });

  test('una muestra por debajo de MIN_TRADES_RELIABLE se marca explícitamente como no fiable', () => {
    // Serie corta a propósito para limitar el número de operaciones posibles.
    const r = runBacktest(uptrend(100));
    if (r.overall.totalTrades > 0 && r.overall.totalTrades < MIN_TRADES_RELIABLE) {
      assert.equal(r.overall.statisticallyReliable, false);
    }
  });

  test('el split in-sample / out-of-sample no pierde ni duplica operaciones respecto al total', () => {
    const r = runBacktest(uptrend(400));
    const isPlusOos = r.inSample.totalTrades + r.outOfSample.totalTrades;
    assert.equal(isPlusOos, r.overall.totalTrades, 'toda operación debe caer en exactamente uno de los dos tramos (IS u OOS), nunca en ninguno ni en ambos');
  });
});

describe('backtestEngine.computeMetrics — cálculo correcto sobre operaciones conocidas a mano', () => {
  test('win rate, profit factor y expectancy sobre un caso construido a mano', () => {
    // 2 ganadoras (+10%, +20%) y 1 perdedora (-10%) — valores elegidos
    // para poder verificar el cálculo con una calculadora, no solo
    // confiar en que "el código hace lo que el código hace".
    const trades = [
      { pnlPct: 0.10 }, { pnlPct: 0.20 }, { pnlPct: -0.10 },
    ];
    const m = computeMetrics(trades);
    assert.equal(m.totalTrades, 3);
    assert.equal(m.wins, 2);
    assert.equal(m.losses, 1);
    assert.equal(m.winRate, Math.round((2 / 3) * 1000) / 10);
    // profitFactor = gananciaBruta / |pérdidaBruta| = (0.10+0.20) / 0.10 = 3
    assert.equal(m.profitFactor, 3);
    // expectancy = media simple de pnlPct en % = (10+20-10)/3 = 6.666...
    assert.equal(m.expectancyPct, Math.round((0.10 + 0.20 - 0.10) / 3 * 10000) / 100);
  });

  test('drawdown máximo se calcula sobre la curva de equity secuencial, no sobre operaciones individuales', () => {
    // +50%, luego -40%: equity va 1 -> 1.5 -> 0.9. Drawdown desde el pico
    // 1.5 hasta 0.9 = (1.5-0.9)/1.5 = 40%.
    const trades = [{ pnlPct: 0.5 }, { pnlPct: -0.4 }];
    const m = computeMetrics(trades);
    assert.equal(m.maxDrawdownPct, 40);
  });

  test('sin operaciones -> todas las métricas null, nunca 0% disfrazado de "sin pérdidas"', () => {
    const m = computeMetrics([]);
    assert.equal(m.totalTrades, 0);
    assert.equal(m.winRate, null);
    assert.equal(m.profitFactor, null);
    assert.equal(m.maxDrawdownPct, null);
  });
});

describe('backtestEngine.buyAndHoldBenchmark', () => {
  test('una tendencia alcista limpia da un benchmark positivo', () => {
    const pct = buyAndHoldBenchmark(uptrend(200));
    assert.ok(pct > 0);
  });

  test('una tendencia bajista limpia da un benchmark negativo', () => {
    const pct = buyAndHoldBenchmark(downtrend(200));
    assert.ok(pct < 0);
  });
});

describe('backtestEngine — reproducibilidad', () => {
  test('el mismo histórico produce exactamente el mismo backtest siempre', () => {
    const candles = uptrend(250, { seed: 42 });
    const r1 = runBacktest(candles);
    const r2 = runBacktest(candles);
    assert.deepEqual(r1, r2);
  });
});
