/*
  Orquestador único del AI Analyzer. Implementa el pipeline pedido:

    DATOS → CÁLCULOS → ESTRUCTURA → SCORING → (IA) → SEÑAL FINAL → EXPLICACIÓN

  con DOS caminos posibles, según si hay datos de mercado reales
  disponibles para el activo indicado:

  - CAMINO REAL (source: 'REAL_DATA'): cuando el activo es uno de los que
    Vantex ya sigue con precios reales (ver server/services/market.js),
    se piden velas OHLCV reales y la señal sale ÍNTEGRAMENTE de
    server/services/signalEngine.js — cálculo determinista, cero
    llamadas a un LLM, y por tanto cero riesgo de que el "análisis" sea
    en realidad una alucinación. Es el camino rápido, preciso y el que
    de verdad puede mostrar RSI/MACD/EMA/soportes reales.

  - CAMINO VISUAL (source: 'VISUAL'): para cualquier otro activo (la
    mayoría de capturas reales: acciones, forex, alts sin cobertura,
    o cuando no hay pista de símbolo) no hay datos reales que consultar,
    así que Claude Vision lee la imagen — pero su confianza nunca se usa
    tal cual: se gobierna en este archivo con reglas explícitas, la señal
    se fuerza a ESPERAR si la confianza gobernada es demasiado baja, y el
    resultado se marca siempre como menos fiable que el camino real.

  Ambos caminos devuelven exactamente la misma forma de objeto, para que
  el resto de la app (rutas, ambos frontends) no tenga que saber cuál se
  usó — solo lee `source` si quiere mostrarlo.
*/
const market = require('./market');
const { callClaudeVision, mockAnalysis, resolveMode, DISCLAIMER } = require('./claude');
const { computeMultiTimeframeSignal, buildScenarios, MIN_CANDLES } = require('./signalEngine');

// Normaliza lo que el usuario escriba ("btc", "BTC/USDT", "BTC-USD"...) a
// la forma que usa market.js, para poder saber si tenemos datos reales.
function normalizeSymbol(hint) {
  if (!hint) return null;
  return hint.trim().toUpperCase().split(/[\/\-\s]/)[0];
}

// El camino visual nunca es tan fiable como el real: tope duro de
// confianza, para que la diferencia de fiabilidad entre ambos caminos
// sea una garantía del sistema, no una esperanza sobre el buen juicio
// del modelo en cada respuesta.
const VISUAL_CONFIDENCE_CAP = 60;
const VISUAL_WAIT_THRESHOLD = 35;

function governVisualResult(raw, { symbolHint, timeframe, noRealDataNote }) {
  if (raw.isChart === false) {
    return {
      signal: 'WAIT', confidence: 8, risk: 'MEDIUM',
      asset: raw.asset || symbolHint || 'Desconocido',
      trend: 'SIDEWAYS', momentum: 'UNAVAILABLE', volume: 'UNAVAILABLE', structure: 'UNAVAILABLE',
      support: [], resistance: [],
      reasons: ['La imagen no se ha podido reconocer con claridad como un gráfico de precios de un activo financiero.'],
      mainReason: 'La imagen no parece un gráfico de precios.',
      summary: raw.summary || raw.reasoning || '',
      dataQuality: 'LOW', source: 'VISUAL', timeframe: timeframe || null,
      scenarios: { primary: 'No se pudo identificar un gráfico de precios en la imagen.', alternative: null, invalidation: null, keyLevels: { entryArea: null, invalidation: null, targets: [], riskContext: null } },
    };
  }

  // Confianza gobernada: parte de señales objetivas y concretas (¿se lee
  // el eje?, ¿hay niveles?, ¿se identificó el activo?) y solo usa la
  // autoevaluación del modelo como una entrada más, nunca como la única
  // fuente — así una respuesta "segura de sí misma" del modelo no basta
  // por sí sola para mostrar una confianza alta.
  let base = 45;
  base += raw.priceAxisLegible ? 15 : -20;
  if ((raw.support || []).length > 0 || (raw.resistance || []).length > 0) base += 5;
  if (!raw.asset || raw.asset === 'Desconocido') base -= 10;
  const modelConf = Math.max(0, Math.min(100, Number(raw.modelConfidence) || 0));
  let confidence = Math.round(base * 0.55 + modelConf * 0.45);
  confidence = Math.max(5, Math.min(VISUAL_CONFIDENCE_CAP, confidence));

  const trendMap = { alcista: 'BULLISH', bajista: 'BEARISH', lateral: 'SIDEWAYS' };
  const biasSignalMap = { compra: 'BUY', venta: 'SELL', esperar: 'WAIT' };
  let signal = biasSignalMap[raw.visualBias] || 'WAIT';

  const reasons = [];
  const downgraded = signal !== 'WAIT' && confidence < VISUAL_WAIT_THRESHOLD;
  if (downgraded) {
    reasons.push(`La lectura visual apuntaba a ${raw.visualBias === 'compra' ? 'compra' : 'venta'}, pero la confianza es demasiado baja para considerarlo una señal (falta legibilidad o confirmación en la imagen).`);
    signal = 'WAIT';
  } else if (signal !== 'WAIT') {
    if (!raw.priceAxisLegible) {
      reasons.push('Tendencia visual identificada, aunque el eje de precios no es del todo legible.');
    } else {
      reasons.push(`Lectura visual: tendencia ${raw.trend} con niveles de soporte/resistencia legibles en la imagen.`);
    }
  } else {
    reasons.push('La lectura visual del gráfico no muestra una dirección lo bastante clara.');
  }
  if (noRealDataNote) reasons.push(noRealDataNote);

  const mainReason = signal === 'WAIT'
    ? (downgraded ? 'Señal visual descartada por baja confianza.' : 'Sin dirección clara en la lectura visual del gráfico.')
    : `Lectura visual del gráfico: tendencia ${raw.trend}${(raw.support || []).length || (raw.resistance || []).length ? ' con niveles clave legibles' : ''}.`;

  // Escenarios: solo si el eje de precios era legible y hay al menos un
  // nivel leído en la imagen — nunca se inventa un nivel para poder
  // rellenar el escenario. Sin precio numérico verificado (esto es una
  // imagen, no datos de mercado), entryArea/riskContext quedan vacíos.
  const scenarios = raw.priceAxisLegible && ((raw.support || []).length || (raw.resistance || []).length)
    ? buildScenarios({ signal, price: null, support: raw.support || [], resistance: raw.resistance || [] })
    : { primary: 'El eje de precios de la imagen no es lo bastante legible para plantear un escenario con niveles concretos.', alternative: null, invalidation: null, keyLevels: { entryArea: null, invalidation: null, targets: [], riskContext: null } };

  return {
    signal, confidence, risk: 'MEDIUM',
    asset: raw.asset || symbolHint || 'Desconocido',
    trend: trendMap[raw.trend] || 'SIDEWAYS',
    momentum: 'UNAVAILABLE', volume: 'UNAVAILABLE', structure: 'UNAVAILABLE',
    support: raw.support || [], resistance: raw.resistance || [],
    reasons: reasons.slice(0, 5), mainReason, scenarios,
    summary: raw.summary || raw.reasoning || '',
    dataQuality: 'LOW', source: 'VISUAL', timeframe: timeframe || null,
  };
}

async function analyzeChart(imageBuffer, mimeType, context = {}) {
  const { symbolHint, timeframe } = context;
  const symbol = normalizeSymbol(symbolHint);
  let noRealDataNote = null;

  if (symbol && market.hasRealDataFor(symbol)) {
    const candles = await market.getMultiTimeframeCandles(symbol);
    if (candles.mainTrend && candles.mainTrend.length >= MIN_CANDLES) {
      const signalResult = computeMultiTimeframeSignal(candles);
      const { debug, ...clean } = signalResult;
      return {
        ...clean,
        asset: symbol,
        source: 'REAL_DATA',
        timeframe: timeframe || null,
        summary: clean.mainReason,
        mock: false,
        disclaimer: DISCLAIMER,
      };
    }
    // Símbolo con cobertura real pero, ahora mismo, sin velas (red no
    // disponible, CoinGecko caído...): nunca se inventan velas — se cae
    // honestamente al camino visual, dejando constancia del motivo.
    noRealDataNote = `No se pudieron obtener datos de mercado en tiempo real para ${symbol} en este momento; este análisis es una lectura visual de la imagen, no está verificado con datos numéricos.`;
  }

  const mode = resolveMode();
  const raw = mode === 'live' ? await callClaudeVision(imageBuffer, mimeType, context) : mockAnalysis(context);
  const governed = governVisualResult(raw, { symbolHint, timeframe, noRealDataNote });
  return { ...governed, mock: mode !== 'live', disclaimer: DISCLAIMER };
}

module.exports = { analyzeChart, resolveMode, DISCLAIMER, normalizeSymbol };
