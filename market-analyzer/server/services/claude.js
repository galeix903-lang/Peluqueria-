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
      asset: { type: 'string', description: 'Activo o par identificado en el gráfico, ej. "BTC/USDT". Si no se puede identificar, usa "Desconocido".' },
      trend: { type: 'string', enum: ['alcista', 'bajista', 'lateral'] },
      support: { type: 'array', items: { type: 'number' }, description: 'Hasta 3 niveles de soporte relevantes visibles en el gráfico.' },
      resistance: { type: 'array', items: { type: 'number' }, description: 'Hasta 3 niveles de resistencia relevantes visibles en el gráfico.' },
      summary: { type: 'string', description: 'Explicación breve (2-4 frases) de la lectura técnica del gráfico.' },
      bias: { type: 'string', enum: ['compra', 'venta', 'esperar'] },
      confidence: { type: 'number', description: 'Confianza de 0 a 100 en esta lectura.' },
    },
    required: ['asset', 'trend', 'support', 'resistance', 'summary', 'bias', 'confidence'],
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
    summary: 'Estructura de máximos y mínimos crecientes; el precio respeta la media móvil de 50 y el volumen acompaña los impulsos alcistas.',
    bias: 'compra', confidence: 68,
  },
  {
    asset: 'ETH/USDT', trend: 'lateral',
    support: [3150, 3020], resistance: [3400, 3550],
    summary: 'Rango bien definido entre soporte y resistencia en las últimas semanas, sin volumen suficiente para confirmar una ruptura clara todavía.',
    bias: 'esperar', confidence: 54,
  },
  {
    asset: 'SOL/USDT', trend: 'bajista',
    support: [128, 118], resistance: [142, 150],
    summary: 'Serie de máximos decrecientes con pérdida del soporte de corto plazo; el rebote actual llega con volumen débil.',
    bias: 'venta', confidence: 61,
  },
];

function mockAnalysis() {
  const base = MOCK_TEMPLATES[Math.floor(Math.random() * MOCK_TEMPLATES.length)];
  return { ...base };
}

async function callClaudeVision(imageBuffer, mimeType) {
  // Import diferido: si no hay API key no hace falta que el SDK esté
  // configurado ni que falle nada en modo mock.
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1024,
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
            text: 'Analiza este gráfico de mercado (velas/precio) como lo haría un analista técnico. Identifica el activo si es visible, la tendencia, niveles de soporte/resistencia visibles, y da un sesgo (compra/venta/esperar) con tu nivel de confianza. Registra el resultado con la herramienta record_chart_analysis.',
          },
        ],
      },
    ],
  });

  const toolUse = message.content.find((block) => block.type === 'tool_use');
  if (!toolUse) throw new Error('El modelo no devolvió un análisis estructurado.');
  return toolUse.input;
}

async function analyzeChart(imageBuffer, mimeType) {
  const mode = resolveMode();
  const result = mode === 'live' ? await callClaudeVision(imageBuffer, mimeType) : mockAnalysis();
  return { ...result, mock: mode !== 'live', disclaimer: DISCLAIMER };
}

module.exports = { analyzeChart, resolveMode, DISCLAIMER };
