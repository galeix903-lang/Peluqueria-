/*
  Analiza una captura de un gráfico de mercado y devuelve un objeto con
  forma fija (ver ANALYSIS_TOOL más abajo). Dos modos:

  - real: llama a Claude (con visión) usando "tool use" forzado, para que
    la respuesta sea siempre JSON válido con esa forma exacta.
  - mock: sin llamar a ninguna API, devuelve un ejemplo realista (elegido
    entre varias plantillas) para poder desarrollar y probar el resto del
    producto sin necesitar una API key todavía.

  El modo se decide en cada llamada según ANALYZER_MODE y si hay
  ANTHROPIC_API_KEY configurada — así, añadir la key en `.env` activa el
  modo real sin tocar código.
*/
const DISCLAIMER = 'Esto es información educativa generada por IA, no es asesoría financiera. Opera bajo tu propio criterio y asumiendo el riesgo.';

const ANALYSIS_TOOL = {
  name: 'record_chart_analysis',
  description: 'Registra el análisis estructurado de un gráfico de mercado.',
  input_schema: {
    type: 'object',
    properties: {
      // Se pide primero a propósito: al generarse antes que el resto de
      // campos, obliga al modelo a describir lo que ve literalmente
      // (ejes, velas, rango de precios visible) antes de concluir
      // tendencia/niveles/sesgo, en vez de saltar directo a una
      // conclusión sin haber "mirado" la imagen con cuidado.
      reasoning: {
        type: 'string',
        description: 'Antes de concluir nada: describe en 2-4 frases lo que ves literalmente en la imagen (¿hay velas o una línea de precio? ¿se lee un eje de precios con números? ¿qué rango cubre? ¿cómo son las últimas velas visibles?). Sé factual y no anticipes aquí la conclusión.',
      },
      isChart: {
        type: 'boolean',
        description: 'true si la imagen es claramente un gráfico de precios de un activo financiero (velas, línea de precio con eje temporal, indicadores técnicos, etc.); false si es otra cosa (captura de una app, foto, imagen borrosa o irreconocible) o si tienes dudas serias de que lo sea.',
      },
      asset: { type: 'string', description: 'Activo o par identificado en el gráfico, ej. "BTC/USDT". Si no se puede identificar con certeza, usa "Desconocido" en vez de adivinar.' },
      trend: { type: 'string', enum: ['alcista', 'bajista', 'lateral'] },
      support: { type: 'array', items: { type: 'number' }, description: 'Hasta 3 niveles de soporte visibles en el gráfico. Usa los números exactos del eje de precios si son legibles; si no lo son, indícalo en el resumen en vez de inventar cifras con falsa precisión.' },
      resistance: { type: 'array', items: { type: 'number' }, description: 'Hasta 3 niveles de resistencia visibles en el gráfico. Mismo criterio que support: cifras leídas del eje, nunca inventadas.' },
      summary: { type: 'string', description: 'Explicación breve (2-4 frases) de la lectura técnica del gráfico, mencionando explícitamente cualquier limitación (eje no legible, imagen recortada, activo no identificado, etc.) si la hay.' },
      bias: { type: 'string', enum: ['compra', 'venta', 'esperar'] },
      confidence: {
        type: 'number',
        description: 'Confianza de 0 a 100, calibrada de verdad: usa valores bajos (<35) si la imagen no es un gráfico claro, si el eje de precios no se lee, o si el activo/tendencia no son evidentes. No uses cifras altas por defecto.',
      },
    },
    required: ['reasoning', 'isChart', 'asset', 'trend', 'support', 'resistance', 'summary', 'bias', 'confidence'],
  },
};

function resolveMode() {
  const configured = (process.env.ANALYZER_MODE || 'auto').toLowerCase();
  const hasKey = !!process.env.ANTHROPIC_API_KEY;
  if (configured === 'mock') return 'mock';
  if (configured === 'live') return 'live';
  return hasKey ? 'live' : 'mock';
}

const MOCK_TEMPLATES = [
  {
    asset: 'BTC/USDT', trend: 'alcista',
    support: [61200, 59500], resistance: [64800, 67000],
    reasoning: 'La imagen muestra velas japonesas sobre un eje de precios legible entre ~58.000 y ~68.000, con máximos y mínimos sucesivamente más altos y volumen creciente en los impulsos.',
    isChart: true,
    summary: 'Estructura de máximos y mínimos crecientes; el precio respeta la media móvil de 50 y el volumen acompaña los impulsos alcistas.',
    bias: 'compra', confidence: 68,
  },
  {
    asset: 'ETH/USDT', trend: 'lateral',
    support: [3150, 3020], resistance: [3400, 3550],
    reasoning: 'Se observa un rango lateral bien delimitado en el eje de precios, con varios toques claros en la zona alta y baja del rango y sin expansión de volumen en los extremos.',
    isChart: true,
    summary: 'Rango bien definido entre soporte y resistencia en las últimas semanas, sin volumen suficiente para confirmar una ruptura clara todavía.',
    bias: 'esperar', confidence: 54,
  },
  {
    asset: 'SOL/USDT', trend: 'bajista',
    support: [128, 118], resistance: [142, 150],
    reasoning: 'La serie de velas muestra máximos decrecientes y una ruptura reciente del soporte de corto plazo, con un rebote posterior de volumen débil.',
    isChart: true,
    summary: 'Serie de máximos decrecientes con pérdida del soporte de corto plazo; el rebote actual llega con volumen débil.',
    bias: 'venta', confidence: 61,
  },
];

function mockAnalysis({ symbolHint } = {}) {
  const base = MOCK_TEMPLATES[Math.floor(Math.random() * MOCK_TEMPLATES.length)];
  // Si el usuario indicó el activo, se respeta en vez del de la plantilla
  // — así la respuesta de ejemplo se siente coherente con lo que pidió.
  const asset = symbolHint ? `${symbolHint.toUpperCase()}/USDT` : base.asset;
  return { ...base, asset };
}

async function callClaudeVision(imageBuffer, mimeType, { symbolHint, timeframe } = {}) {
  // Import diferido: si no hay API key no hace falta que el SDK esté
  // configurado ni que falle nada en modo mock.
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const hints = [
    symbolHint ? `El usuario indica que el activo es "${symbolHint}".` : null,
    timeframe ? `El usuario indica que el gráfico está en temporalidad "${timeframe}".` : null,
  ].filter(Boolean).join(' ');

  const message = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1536,
    tools: [ANALYSIS_TOOL],
    tool_choice: { type: 'tool', name: ANALYSIS_TOOL.name },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mimeType, data: imageBuffer.toString('base64') },
          },
          {
            type: 'text',
            text: `Analiza esta imagen como lo haría un analista técnico riguroso, pero solo a partir de lo que realmente puedas leer en ella — no completes con suposiciones lo que no se vea con claridad. Primero describe en el campo "reasoning" lo que observas literalmente (¿hay velas o línea de precio? ¿se lee un eje de precios con cifras? ¿qué rango cubre?) antes de concluir nada. Si la imagen no es claramente un gráfico de precios de un activo financiero, o el eje de precios no es legible, dilo explícitamente (isChart en false y/o confidence baja) en vez de inventar una lectura completa. Identifica el activo solo si es reconocible, la tendencia, niveles de soporte/resistencia (con las cifras exactas del eje si se leen, aproximadas si no, dejándolo claro en el resumen), y un sesgo (compra/venta/esperar) con una confianza calibrada de verdad a lo que puedes justificar con la imagen. ${hints} Registra el resultado con la herramienta record_chart_analysis.`,
          },
        ],
      },
    ],
  });

  const toolUse = message.content.find((block) => block.type === 'tool_use');
  if (!toolUse) throw new Error('El modelo no devolvió un análisis estructurado.');
  return toolUse.input;
}

async function analyzeChart(imageBuffer, mimeType, context = {}) {
  const mode = resolveMode();
  const result = mode === 'live' ? await callClaudeVision(imageBuffer, mimeType, context) : mockAnalysis(context);
  return { ...result, mock: mode !== 'live', disclaimer: DISCLAIMER };
}

module.exports = { analyzeChart, resolveMode, DISCLAIMER };
