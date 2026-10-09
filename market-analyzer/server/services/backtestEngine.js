/*
  Backtest REAL del motor determinista (server/services/signalEngine.js)
  sobre velas OHLCV reales — nunca sobre datos simulados o inventados.

  Garantía de cero look-ahead (la condición no negociable de cualquier
  backtest honesto): en el paso `i`, la señal se calcula ÚNICAMENTE con
  `candles.slice(0, i + 1)` — el motor nunca ve una vela futura. Y para
  que ni siquiera el precio de ejecución pueda acusarse de mirar al
  futuro, la operación se abre/cierra al OPEN de la vela SIGUIENTE a la
  que generó la señal (candles[i+1].open), nunca al close de la propia
  vela que la generó — así la señal "ya está tomada" antes del precio al
  que se ejecuta, exactamente como en un sistema real donde la orden se
  manda tras el cierre de la vela y se ejecuta en la siguiente.

  Walk-forward / in-sample vs out-of-sample: signalEngine.js no tiene
  ningún parámetro AJUSTADO sobre datos históricos (los pesos y umbrales
  son fijos, elegidos por diseño, no optimizados/fiteados sobre ninguna
  serie concreta) — así que el "overfitting" clásico de fitear parámetros
  y lucirlos sobre el mismo tramo no puede ocurrir aquí. Lo que SÍ se
  puede detectar, y es lo que hace el split IS/OOS de este archivo, es si
  el comportamiento del motor es consistente entre dos tramos de tiempo
  distintos o si depende demasiado del régimen de mercado de un tramo
  concreto (p.ej. funciona en tendencia y se rompe en lateral).

  Honestidad de la muestra: con MIN_TRADES_RELIABLE operaciones o menos,
  el resultado se marca explícitamente `statisticallyReliable: false` —
  nunca se presenta un win rate de "2 de 3" como si fuera una prueba de
  nada. Y si el motor no genera ninguna operación en todo el periodo
  (todo WAIT), eso también es un resultado honesto y se reporta como tal,
  nunca se "ayuda" a que aparezcan operaciones.
*/
const { computeSignal, MIN_CANDLES } = require('./signalEngine');
const { validateCandles } = require('./dataValidation');

const MIN_TRADES_RELIABLE = 20; // umbral blando — ver nota en el módulo
const DEFAULT_COST_BPS = 20; // 0.20% de coste (comisión + slippage) por operación completa (entrada+salida), asunción conservadora documentada

function pnlPct(side, entryPrice, exitPrice) {
  const raw = side === 'long' ? (exitPrice - entryPrice) / entryPrice : (entryPrice - exitPrice) / entryPrice;
  return raw;
}

// Recorre las velas UNA sola vez generando la lista completa de
// operaciones (nunca se tira el tramo "in-sample" como si solo sirviera
// de calentamiento — ver nota del módulo sobre walk-forward), y después
// esa misma lista se puede partir por fecha para comparar IS vs OOS sin
// recalcular nada ni sesgar ninguno de los dos tramos.
function simulateTrades(candles, { costBps = DEFAULT_COST_BPS } = {}) {
  const trades = [];
  let position = null; // { side, entryIndex, entryTime, entryPrice }
  const costFrac = costBps / 10000;

  // Primer índice con MIN_CANDLES velas detrás; último índice con una
  // vela siguiente disponible para ejecutar la orden.
  const start = MIN_CANDLES - 1;
  const end = candles.length - 2;

  for (let i = start; i <= end; i++) {
    const visibleCandles = candles.slice(0, i + 1); // nunca candles.slice(0, algo > i+1)
    const { signal } = computeSignal({ candles: visibleCandles });
    const execCandle = candles[i + 1]; // ejecución SIEMPRE en la vela siguiente a la señal

    if (position) {
      const sameDirection = (position.side === 'long' && signal === 'BUY') || (position.side === 'short' && signal === 'SELL');
      if (!sameDirection) {
        // WAIT o señal contraria: se cierra la posición al open de la
        // vela siguiente — nunca al close de la vela que generó la señal.
        const rawPnl = pnlPct(position.side, position.entryPrice, execCandle.open);
        trades.push({
          side: position.side,
          entryIndex: position.entryIndex, entryTime: position.entryTime, entryPrice: position.entryPrice,
          exitIndex: i + 1, exitTime: execCandle.time, exitPrice: execCandle.open,
          pnlPct: rawPnl - costFrac,
          closedAtDataEnd: false,
        });
        position = null;
        // Si la señal es la contraria directa (no WAIT), se abre la nueva
        // posición en el mismo punto de ejecución — un cambio de sesgo no
        // deja al sistema fuera del mercado más tiempo del necesario.
        if (signal === 'BUY' || signal === 'SELL') {
          position = { side: signal === 'BUY' ? 'long' : 'short', entryIndex: i + 1, entryTime: execCandle.time, entryPrice: execCandle.open };
        }
      }
      // mismo sentido: se mantiene la posición, no se hace nada
    } else if (signal === 'BUY' || signal === 'SELL') {
      position = { side: signal === 'BUY' ? 'long' : 'short', entryIndex: i + 1, entryTime: execCandle.time, entryPrice: execCandle.open };
    }
  }

  // Posición todavía abierta al final de los datos disponibles: se
  // cierra al close de la última vela — no queda "flotando" fuera de las
  // métricas, pero se marca para que quien lea el resultado sepa que ese
  // cierre es un artefacto del final de la muestra, no una señal real.
  if (position) {
    const lastCandle = candles[candles.length - 1];
    const rawPnl = pnlPct(position.side, position.entryPrice, lastCandle.close);
    trades.push({
      side: position.side,
      entryIndex: position.entryIndex, entryTime: position.entryTime, entryPrice: position.entryPrice,
      exitIndex: candles.length - 1, exitTime: lastCandle.time, exitPrice: lastCandle.close,
      pnlPct: rawPnl - costFrac,
      closedAtDataEnd: true,
    });
  }

  return trades;
}

// Métricas sobre una lista de operaciones ya cerradas — honestas: con 0
// operaciones, todo sale `null`, nunca 0% disfrazado de "sin pérdidas".
function computeMetrics(trades) {
  if (!trades.length) {
    return {
      totalTrades: 0, winRate: null, profitFactor: null, expectancyPct: null,
      maxDrawdownPct: null, totalReturnPct: null, statisticallyReliable: false,
      note: 'El motor no generó ninguna operación en este periodo con estos datos (todo WAIT) — no hay nada que medir, y eso es preferible a fabricar operaciones para tener qué mostrar.',
    };
  }

  const wins = trades.filter((t) => t.pnlPct > 0);
  const losses = trades.filter((t) => t.pnlPct <= 0);
  const grossProfit = wins.reduce((s, t) => s + t.pnlPct, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlPct, 0));

  // Curva de equity: operaciones secuenciales y nunca solapadas (el
  // motor siempre está plano o en una única posición a la vez), así que
  // multiplicar en orden es correcto sin tener que modelar concurrencia.
  let equity = 1;
  let peak = 1;
  let maxDrawdownPct = 0;
  for (const t of trades) {
    equity *= (1 + t.pnlPct);
    peak = Math.max(peak, equity);
    const drawdown = (peak - equity) / peak;
    if (drawdown > maxDrawdownPct) maxDrawdownPct = drawdown;
  }

  const totalReturnPct = (equity - 1) * 100;
  const expectancyPct = (trades.reduce((s, t) => s + t.pnlPct, 0) / trades.length) * 100;
  const winRate = (wins.length / trades.length) * 100;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : null);

  return {
    totalTrades: trades.length,
    wins: wins.length, losses: losses.length,
    winRate: Math.round(winRate * 10) / 10,
    profitFactor: Number.isFinite(profitFactor) ? Math.round(profitFactor * 100) / 100 : profitFactor,
    expectancyPct: Math.round(expectancyPct * 100) / 100,
    maxDrawdownPct: Math.round(maxDrawdownPct * 1000) / 10,
    totalReturnPct: Math.round(totalReturnPct * 100) / 100,
    statisticallyReliable: trades.length >= MIN_TRADES_RELIABLE,
    note: trades.length < MIN_TRADES_RELIABLE
      ? `Solo ${trades.length} operaciones en todo el periodo — muy por debajo de una muestra fiable (se usa ${MIN_TRADES_RELIABLE} como umbral orientativo mínimo). Estos números son ilustrativos, no una prueba de que el sistema funcione.`
      : `${trades.length} operaciones — muestra razonable, pero sigue siendo UN periodo histórico concreto, no una garantía de comportamiento futuro.`,
  };
}

// Benchmark honesto: comprar y mantener el mismo activo durante
// exactamente la misma ventana que el backtest, nada más sofisticado —
// sirve para saber si el motor aporta algo sobre "no hacer nada".
function buyAndHoldBenchmark(candles) {
  const start = MIN_CANDLES - 1;
  if (candles.length <= start + 1) return null;
  const entry = candles[start + 1].open;
  const exit = candles[candles.length - 1].close;
  return Math.round(((exit - entry) / entry) * 10000) / 100; // %
}

/*
  Punto de entrada. `candles` debe ser el array completo y ordenado
  cronológicamente que ya pasó validateCandles() en el pipeline de
  análisis en vivo — aquí se vuelve a validar igualmente, por si el
  backtest se invoca de forma independiente (p.ej. desde un endpoint
  propio) con datos que no pasaron por ese mismo camino.
*/
function runBacktest(candles, { costBps = DEFAULT_COST_BPS, splitRatio = 0.7, timeframeKind = 'daily' } = {}) {
  const validation = validateCandles(candles, { timeframeKind, minCandles: MIN_CANDLES * 2, skipStaleness: true });
  if (!validation.ok) {
    return {
      ok: false, status: validation.status, reason: validation.reason,
      overall: null, inSample: null, outOfSample: null, benchmarkPct: null, trades: [],
    };
  }
  const trades = simulateTrades(candles, { costBps });
  const splitIndex = Math.floor(candles.length * splitRatio);
  const splitTime = candles[Math.min(splitIndex, candles.length - 1)].time;

  const isTrades = trades.filter((t) => t.entryTime < splitTime);
  const oosTrades = trades.filter((t) => t.entryTime >= splitTime);

  return {
    ok: true, status: 'OK', reason: null,
    dataRange: { from: candles[0].time, to: candles[candles.length - 1].time, totalCandles: candles.length },
    costAssumptionBps: costBps,
    overall: computeMetrics(trades),
    inSample: computeMetrics(isTrades),
    outOfSample: computeMetrics(oosTrades),
    benchmarkBuyAndHoldPct: buyAndHoldBenchmark(candles),
    trades: trades.map((t) => ({ ...t, pnlPct: Math.round(t.pnlPct * 10000) / 100 })), // a % con 2 decimales, legible
  };
}

module.exports = { runBacktest, simulateTrades, computeMetrics, buyAndHoldBenchmark, MIN_TRADES_RELIABLE, DEFAULT_COST_BPS };
