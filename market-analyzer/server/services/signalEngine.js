/*
  Motor de decisión determinista: toma velas OHLCV reales (dos contextos
  de temporalidad) y devuelve una señal BUY/SELL/WAIT con confianza, sin
  ninguna llamada a un LLM. Esta es la pieza central que reemplaza a "la
  IA opina mirando la imagen" por "el código calcula, la IA (cuando se
  usa) solo redacta" — ver server/services/claude.js y el pipeline en
  server/services/analysisPipeline.js.

  Pesos y umbrales: elegidos tras revisar el sistema anterior (que no
  tenía ninguno — todo dependía del juicio libre de un LLM). No son un
  estándar de la industria, son un punto de partida razonable y
  documentado; lo importante arquitectónicamente es que AHORA existen,
  son deterministas, y ningún indicador solo puede decidir la señal.
*/
const { ema, rsi, macd, atr, relativeVolume, last } = require('./indicators');
const { findSwings, trendStructure, clusterLevels, supportResistance, detectBreakout, isConsolidating } = require('./structure');

const MIN_CANDLES = 30; // por debajo de esto, no hay base suficiente para nada

function classifyTrend(closes, structureLabel) {
  const price = last(closes.map((c) => c));
  const ema20 = last(ema(closes, 20));
  const ema50 = last(ema(closes, 50));
  const ema200Series = closes.length >= 200 ? ema(closes, 200) : null;
  const ema200 = ema200Series ? last(ema200Series) : null;

  let emaScore = 0;
  if (ema20 != null && ema50 != null) {
    if (price > ema20 && ema20 > ema50) emaScore = ema200 != null ? (ema50 > ema200 ? 1 : 0.6) : 0.8;
    else if (price < ema20 && ema20 < ema50) emaScore = ema200 != null ? (ema50 < ema200 ? -1 : -0.6) : -0.8;
    else emaScore = price > ema20 ? 0.3 : -0.3;
  }

  const structureScore = structureLabel === 'alcista' ? 1 : structureLabel === 'bajista' ? -1 : 0;
  const score = (emaScore + structureScore) / 2;
  const label = score > 0.25 ? 'BULLISH' : score < -0.25 ? 'BEARISH' : 'SIDEWAYS';
  return { score, label, ema20, ema50, ema200, hasEma200: ema200 != null };
}

// RSI>70 NO es venta automática, RSI<30 NO es compra automática (regla
// explícita) — el momentum se lee por la DIRECCIÓN reciente del
// indicador y por el histograma de MACD, no por el nivel absoluto de
// RSI; un RSI extremo solo se marca como caution flag (ver confidence).
function classifyMomentum(closes) {
  const rsiSeries = rsi(closes, 14);
  const rsiNow = last(rsiSeries);
  const rsiPrev = rsiSeries[rsiSeries.length - 6] ?? rsiSeries[rsiSeries.length - 2];
  const macdData = macd(closes);
  const histNow = last(macdData.histogram);
  const histPrev = macdData.histogram[macdData.histogram.length - 4] ?? null;

  // Simétrico alrededor de 50 (nunca rangos solapados): el signo lo da
  // en qué mitad está el RSI, la dirección reciente solo modula la
  // magnitud. Un RSI extremo (>=70 o <=30) NO invierte el signo — eso es
  // justo lo que evita que "RSI>70 → venta automática".
  let rsiScore = 0;
  if (rsiNow != null && rsiPrev != null) {
    const rising = rsiNow > rsiPrev;
    rsiScore = rsiNow >= 50 ? (rising ? 0.7 : 0.3) : (rising ? -0.3 : -0.7);
  }

  let macdScore = 0;
  if (histNow != null) {
    const rising = histPrev != null ? histNow > histPrev : histNow > 0;
    macdScore = histNow > 0 ? (rising ? 1 : 0.4) : (rising ? -0.4 : -1);
  }

  const score = rsiNow != null && histNow != null ? (rsiScore + macdScore) / 2 : (macdScore || rsiScore);
  const label = score > 0.25 ? 'POSITIVE' : score < -0.25 ? 'NEGATIVE' : 'NEUTRAL';
  const extremeRsi = rsiNow != null && (rsiNow >= 75 || rsiNow <= 25);
  return { score, label, rsi: rsiNow, macdHistogram: histNow, extremeRsi };
}

function classifyPriceStructure(candles, structureLabel) {
  const price = candles[candles.length - 1].close;
  const swings = findSwings(candles, 2);
  const { support, resistance } = supportResistance(swings, price);
  // Solo cuentan como "nivel roto" las zonas con 2+ toques — un solo
  // swing suelto no es un soporte/resistencia real todavía, y sin este
  // filtro un mercado oscilando (subida-bajada-subida normal) se leería
  // como una sucesión de falsas rupturas.
  const establishedLevels = clusterLevels([...swings.highs, ...swings.lows]).filter((z) => z.touches >= 2).map((z) => z.price);
  const breakout = detectBreakout(candles, establishedLevels);

  let score = structureLabel === 'alcista' ? 0.4 : structureLabel === 'bajista' ? -0.4 : 0;
  if (breakout) score = breakout.type === 'alcista' ? 1 : -1;
  else {
    const nearestSupport = support[0];
    const nearestResistance = resistance[0];
    if (nearestSupport != null && (price - nearestSupport) / price < 0.01) score = Math.max(score, 0.3);
    if (nearestResistance != null && (nearestResistance - price) / price < 0.01) score = Math.min(score, -0.3);
  }

  const label = score > 0.25 ? 'BULLISH' : score < -0.25 ? 'BEARISH' : 'MIXED';
  return { score, label, support, resistance, breakout };
}

function classifyVolume(candles, directionScore) {
  const volumes = candles.map((c) => c.volume).filter((v) => v != null);
  if (volumes.length < 20) return { score: 0, label: 'UNAVAILABLE', relative: null };
  const relative = relativeVolume(candles.map((c) => c.volume ?? 0), 20);
  if (relative == null) return { score: 0, label: 'UNAVAILABLE', relative: null };
  // El volumen solo puntúa EN LA DIRECCIÓN que ya marcan los demás
  // factores (confirma o debilita, nunca decide la dirección él solo).
  const directionSign = directionScore > 0.15 ? 1 : directionScore < -0.15 ? -1 : 0;
  let score = 0;
  let label = 'WEAK';
  if (relative >= 1.3) { score = 0.8 * directionSign; label = 'CONFIRMING'; }
  else if (relative >= 1.0) { score = 0.3 * directionSign; label = directionSign === 0 ? 'WEAK' : 'CONFIRMING'; }
  else { score = 0; label = 'WEAK'; }
  return { score, label, relative };
}

function classifyRisk(candles, closes) {
  const atrSeries = atr(candles, 14);
  const atrNow = last(atrSeries);
  const price = closes[closes.length - 1];
  if (atrNow == null || !price) return { label: 'MEDIUM', atrPct: null };
  const atrPct = atrNow / price;
  const label = atrPct > 0.04 ? 'HIGH' : atrPct > 0.015 ? 'MEDIUM' : 'LOW';
  return { label, atrPct, atrNow };
}

const REASON_TEMPLATES = {
  trend: {
    BULLISH: 'Tendencia alcista: precio por encima de las medias móviles y estructura de máximos y mínimos crecientes.',
    BEARISH: 'Tendencia bajista: precio por debajo de las medias móviles y estructura de máximos y mínimos decrecientes.',
  },
  momentum: {
    POSITIVE: 'Momentum positivo: MACD y RSI confirmando fuerza compradora sin sobrecompra extrema.',
    NEGATIVE: 'Momentum negativo: MACD y RSI confirmando presión vendedora.',
  },
  price: {
    breakoutBullish: (level) => `Ruptura confirmada de resistencia en $${fmt(level)}.`,
    breakoutBearish: (level) => `Ruptura confirmada de soporte en $${fmt(level)}.`,
    BULLISH: 'Precio sostenido sobre una zona de soporte relevante.',
    BEARISH: 'Precio rechazado en una zona de resistencia relevante.',
  },
  volume: {
    CONFIRMING: (rel) => `Volumen confirmando el movimiento (${rel.toFixed(1)}x la media reciente).`,
  },
};
// Precios de memecoin pueden ser una fracción de centavo (p.ej.
// 0,0000129) — con un toFixed(4) fijo se redondearían a "0.0000",
// borrando el dato. Se amplían los decimales solo cuando hace falta;
// para cualquier precio "normal" (>= 0,005) el comportamiento es
// exactamente el de antes.
function fmt(n) {
  if (n >= 100) return Math.round(n).toLocaleString('es-ES');
  if (n > 0 && n < 0.005) {
    const decimals = Math.min(10, Math.max(4, -Math.floor(Math.log10(n)) + 3));
    return n.toFixed(decimals);
  }
  return n.toFixed(4);
}

// Escenarios y niveles clave: SIEMPRE derivados de los mismos support/
// resistance ya calculados con datos reales — nunca una frase genérica
// de relleno. Presenta el futuro como escenarios condicionales ("si pasa
// X, entonces Y"), nunca como una certeza, y siempre incluye qué
// invalidaría la lectura actual.
function buildScenarios({ signal, price, support, resistance }) {
  const nearestSupport = support?.[0] ?? null;
  const nextSupport = support?.[1] ?? null;
  const nearestResistance = resistance?.[0] ?? null;
  const nextResistance = resistance?.[1] ?? null;

  if (nearestSupport == null && nearestResistance == null) {
    return {
      primary: 'No hay niveles de soporte/resistencia suficientes en los datos disponibles para plantear un escenario concreto.',
      alternative: null,
      invalidation: null,
      keyLevels: { entryArea: null, invalidation: null, targets: [], riskContext: null },
    };
  }

  if (signal === 'BUY') {
    return {
      primary: nearestResistance != null
        ? `Mientras el precio se mantenga por encima de $${fmt(nearestSupport)}, el sesgo alcista se mantiene y el próximo nivel relevante es $${fmt(nearestResistance)}.`
        : `Mientras el precio se mantenga por encima de $${fmt(nearestSupport)}, el sesgo alcista se mantiene.`,
      alternative: nextSupport != null
        ? `Un rechazo en resistencia sin ruptura, seguido de la pérdida de $${fmt(nearestSupport)}, abriría paso a un escenario más lateral o bajista hacia $${fmt(nextSupport)}.`
        : `Un rechazo en resistencia sin ruptura, seguido de la pérdida de $${fmt(nearestSupport)}, debilitaría el sesgo alcista actual.`,
      invalidation: `Un cierre sostenido por debajo de $${fmt(nearestSupport)} invalidaría el sesgo alcista actual.`,
      keyLevels: {
        // Zona de entrada = cerca del precio actual. Solo se extiende
        // hasta el soporte si está razonablemente cerca (<=3%) — si el
        // soporte más próximo queda muy lejos, un rango "entrada entre
        // soporte y precio" sería tan ancho que dejaría de ser útil.
        entryArea: price != null
          ? (nearestSupport != null && (price - nearestSupport) / price <= 0.03 ? [nearestSupport, price] : [price * 0.995, price])
          : null,
        invalidation: nearestSupport,
        targets: [nearestResistance, nextResistance].filter((v) => v != null),
        riskContext: nearestSupport != null && price != null ? `Riesgo hasta invalidación: $${fmt(Math.abs(price - nearestSupport))} (${(Math.abs(price - nearestSupport) / price * 100).toFixed(1)}%).` : null,
      },
    };
  }

  if (signal === 'SELL') {
    return {
      primary: nearestSupport != null
        ? `Mientras el precio se mantenga por debajo de $${fmt(nearestResistance)}, el sesgo bajista se mantiene y el próximo nivel relevante es $${fmt(nearestSupport)}.`
        : `Mientras el precio se mantenga por debajo de $${fmt(nearestResistance)}, el sesgo bajista se mantiene.`,
      alternative: nextResistance != null
        ? `Un rechazo en soporte sin ruptura, seguido de la recuperación de $${fmt(nearestResistance)}, abriría paso a un escenario más lateral o alcista hacia $${fmt(nextResistance)}.`
        : `Un rechazo en soporte sin ruptura, seguido de la recuperación de $${fmt(nearestResistance)}, debilitaría el sesgo bajista actual.`,
      invalidation: `Un cierre sostenido por encima de $${fmt(nearestResistance)} invalidaría el sesgo bajista actual.`,
      keyLevels: {
        entryArea: price != null
          ? (nearestResistance != null && (nearestResistance - price) / price <= 0.03 ? [price, nearestResistance] : [price, price * 1.005])
          : null,
        invalidation: nearestResistance,
        targets: [nearestSupport, nextSupport].filter((v) => v != null),
        riskContext: nearestResistance != null && price != null ? `Riesgo hasta invalidación: $${fmt(Math.abs(nearestResistance - price))} (${(Math.abs(nearestResistance - price) / price * 100).toFixed(1)}%).` : null,
      },
    };
  }

  // WAIT: se presentan las dos condiciones que sacarían al activo del
  // rango, sin comprometerse con ninguna dirección todavía.
  return {
    primary: nearestResistance != null && nearestSupport != null
      ? `Mientras el precio se mueva entre $${fmt(nearestSupport)} y $${fmt(nearestResistance)}, no hay suficiente confirmación para un sesgo direccional.`
      : 'No hay suficiente confirmación para un sesgo direccional con los datos actuales.',
    alternative: nearestResistance != null
      ? `Una ruptura confirmada por encima de $${fmt(nearestResistance)} con volumen abriría un escenario alcista.`
      : null,
    invalidation: nearestSupport != null
      ? `Una pérdida confirmada de $${fmt(nearestSupport)} con volumen abriría un escenario bajista.`
      : null,
    keyLevels: {
      entryArea: null,
      invalidation: null,
      targets: [nearestResistance, nearestSupport].filter((v) => v != null),
      riskContext: 'Sin una dirección clara, el contexto de riesgo favorece esperar confirmación antes de dimensionar cualquier operación.',
    },
  };
}

// Motor de scoring: combina las 4 dimensiones direccionales con pesos
// fijos (trend > momentum ≈ price > volume) y exige confluencia real
// para cruzar el umbral de BUY/SELL — un único indicador nunca basta.
function computeSignal({ candles, timeframeNote }) {
  if (!candles || candles.length < MIN_CANDLES) {
    return {
      signal: 'WAIT', confidence: 15, risk: 'MEDIUM',
      trend: 'SIDEWAYS', momentum: 'NEUTRAL', volume: 'UNAVAILABLE', structure: 'MIXED',
      support: [], resistance: [],
      reasons: ['No hay suficientes velas históricas para calcular indicadores fiables.'],
      mainReason: 'Datos insuficientes para generar una señal fiable.',
      dataQuality: 'LOW', timeframeNote,
      scenarios: { primary: 'No hay datos suficientes para plantear un escenario.', alternative: null, invalidation: null, keyLevels: { entryArea: null, invalidation: null, targets: [], riskContext: null } },
    };
  }

  const closes = candles.map((c) => c.close);
  const price = closes[closes.length - 1];
  const swings = findSwings(candles, 2);
  const structureLabel = trendStructure(swings);

  const trend = classifyTrend(closes, structureLabel);
  const momentum = classifyMomentum(closes);
  const priceStructure = classifyPriceStructure(candles, structureLabel);
  const volume = classifyVolume(candles, (trend.score + priceStructure.score) / 2);
  const risk = classifyRisk(candles, closes);
  const consolidating = isConsolidating(candles, risk.atrNow);

  const WEIGHTS = { trend: 0.35, momentum: 0.25, price: 0.25, volume: 0.15 };
  const totalScore =
    trend.score * WEIGHTS.trend +
    momentum.score * WEIGHTS.momentum +
    priceStructure.score * WEIGHTS.price +
    volume.score * WEIGHTS.volume;

  // Confluencia: cuenta cuántas dimensiones apuntan claramente en cada
  // sentido. Si hay tantas señales en contra como a favor, es una
  // contradicción real → ESPERAR, sea cual sea el score ponderado.
  const dims = [trend.score, momentum.score, priceStructure.score];
  const bullishCount = dims.filter((s) => s > 0.25).length;
  const bearishCount = dims.filter((s) => s < -0.25).length;
  const contradiction = bullishCount > 0 && bearishCount > 0;

  let signal = 'WAIT';
  if (!contradiction && !(consolidating && Math.abs(totalScore) < 0.5)) {
    if (totalScore >= 0.35 && bullishCount >= 2) signal = 'BUY';
    else if (totalScore <= -0.35 && bearishCount >= 2) signal = 'SELL';
  }

  // Confianza: parte de la magnitud del score (tope 75, nunca "porque sí"
  // cerca de 100), y se ajusta con calidad de datos, confluencia real,
  // y señales de alerta (RSI extremo, consolidación, volumen débil).
  let confidence = Math.min(75, Math.round(Math.abs(totalScore) * 100));
  const agreementCount = [bullishCount, bearishCount].reduce((a, b) => Math.max(a, b), 0);
  confidence += Math.min(10, Math.max(0, (agreementCount - 2)) * 5);
  if (contradiction) confidence -= 20;
  if (!trend.hasEma200) confidence -= 5;
  if (momentum.extremeRsi) confidence -= 8;
  if (consolidating) confidence -= 10;
  if (signal !== 'WAIT' && volume.label === 'WEAK') confidence -= 8;
  if (volume.label === 'UNAVAILABLE') confidence -= 5;
  if (signal === 'WAIT' && !contradiction && candles.length >= MIN_CANDLES) confidence = Math.max(confidence, 30);
  confidence = Math.max(5, Math.min(95, Math.round(confidence)));

  // Razones: solo se listan factores que de verdad apuntan en el sentido
  // de la señal final (nunca se presenta un factor contrario como si
  // justificara la conclusión) — máximo 5, priorizando los de mayor peso.
  const reasons = [];
  if (signal !== 'WAIT') {
    const dir = signal === 'BUY' ? 'BULLISH' : 'BEARISH';
    if (trend.label === dir) reasons.push(REASON_TEMPLATES.trend[dir]);
    if (momentum.label === (signal === 'BUY' ? 'POSITIVE' : 'NEGATIVE')) reasons.push(REASON_TEMPLATES.momentum[momentum.label]);
    if (priceStructure.breakout && priceStructure.breakout.type === (signal === 'BUY' ? 'alcista' : 'bajista')) {
      reasons.push(signal === 'BUY'
        ? REASON_TEMPLATES.price.breakoutBullish(priceStructure.breakout.level)
        : REASON_TEMPLATES.price.breakoutBearish(priceStructure.breakout.level));
    } else if (priceStructure.label === dir) {
      reasons.push(REASON_TEMPLATES.price[dir]);
    }
    if (volume.label === 'CONFIRMING' && volume.relative) reasons.push(REASON_TEMPLATES.volume.CONFIRMING(volume.relative));
  } else {
    if (contradiction) reasons.push('Las señales de tendencia, momentum y estructura son contradictorias entre sí.');
    if (consolidating) reasons.push('El precio está en consolidación, sin una ruptura confirmada todavía.');
    if (momentum.extremeRsi) reasons.push('RSI en zona extrema: mayor riesgo de un giro o una señal falsa a corto plazo.');
    if (!reasons.length) reasons.push('No hay suficiente confluencia entre los factores analizados para una señal clara.');
  }

  const mainReason = reasons.slice(0, 3).join(' + ').replace(/\.\s*\+/g, ' +').replace(/\.$/, '') || reasons[0] || 'Sin motivo determinante.';
  const scenarios = buildScenarios({ signal, price, support: priceStructure.support, resistance: priceStructure.resistance });

  return {
    signal, confidence, risk: risk.label,
    price, trend: trend.label, momentum: momentum.label,
    volume: volume.label, structure: structureLabel === 'alcista' ? 'BULLISH' : structureLabel === 'bajista' ? 'BEARISH' : 'MIXED',
    support: priceStructure.support, resistance: priceStructure.resistance,
    reasons: reasons.slice(0, 5), mainReason, scenarios,
    dataQuality: candles.length >= 150 && volume.label !== 'UNAVAILABLE' ? 'HIGH' : candles.length >= MIN_CANDLES ? 'MEDIUM' : 'LOW',
    timeframeNote,
    debug: { totalScore, trendScore: trend.score, momentumScore: momentum.score, priceScore: priceStructure.score, volumeScore: volume.score, contradiction, consolidating },
  };
}

// Multi-timeframe: la tendencia principal (velas de 4h/30d) manda; el
// timeframe corto (30min/2d) solo puede AJUSTAR la confianza y dejar
// constancia explícita si contradice al principal — nunca voltear la
// señal él solo (regla explícita: "no permitas que un timeframe pequeño
// contradiga completamente la tendencia principal sin explicarlo").
function computeMultiTimeframeSignal({ mainTrend, shortTerm }, mainTrendNote = 'Velas de 4h de los últimos 30 días (CoinGecko).') {
  const primary = computeSignal({ candles: mainTrend, timeframeNote: mainTrendNote });
  if (!shortTerm || shortTerm.length < MIN_CANDLES || primary.signal === 'WAIT') {
    return primary;
  }

  const shortCloses = shortTerm.map((c) => c.close);
  const shortMomentum = classifyMomentum(shortCloses);
  const primaryDir = primary.signal === 'BUY' ? 1 : -1;
  const shortDir = shortMomentum.score > 0.25 ? 1 : shortMomentum.score < -0.25 ? -1 : 0;

  if (shortDir !== 0 && shortDir !== primaryDir) {
    primary.confidence = Math.max(5, primary.confidence - 15);
    primary.reasons = [
      ...primary.reasons.slice(0, 4),
      `El corto plazo (30min) muestra momentum ${shortDir > 0 ? 'alcista' : 'bajista'}, en contra de la tendencia principal — se mantiene la señal de fondo pero con menor confianza.`,
    ].slice(0, 5);
  }
  return primary;
}

module.exports = { computeSignal, computeMultiTimeframeSignal, buildScenarios, MIN_CANDLES };
