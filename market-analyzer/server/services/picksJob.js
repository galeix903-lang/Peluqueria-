/*
  Genera "Handpicked Bets": picks diarios sobre un par de símbolos fijos,
  usando el mismo motor de análisis que el AI Analyzer pero sin imagen (le
  pedimos directamente una lectura sobre el símbolo). Se ejecuta una vez al
  día vía node-cron, y también "a demanda" la primera vez que alguien pide
  /api/picks y todavía no hay ninguno guardado (para no tener la pantalla
  vacía en una demo recién arrancada).
*/
const cron = require('node-cron');
const store = require('./../store');
const { resolveMode, DISCLAIMER } = require('./claude');

const SYMBOLS = ['BTC/USDT', 'ETH/USDT'];

const MOCK_PICKS = {
  'BTC/USDT': { trend: 'alcista', bias: 'compra', confidence: 66, summary: 'Momentum comprador sostenido en el marco diario, con soportes previos actuando ahora como zona de apoyo.' },
  'ETH/USDT': { trend: 'lateral', bias: 'esperar', confidence: 52, summary: 'Consolidación dentro de rango; se espera confirmación de ruptura antes de tomar una posición direccional.' },
};

async function generatePick(symbol) {
  const mode = resolveMode();

  if (mode === 'live') {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `Actúa como analista técnico cripto. Da una lectura breve (2 frases) y un sesgo de trading para ${symbol} en el marco diario, basándote en patrones técnicos generales típicos de este tipo de activo (no tienes datos de precio en vivo, así que sé genérico pero plausible). Responde en JSON con esta forma exacta: {"trend":"alcista|bajista|lateral","bias":"compra|venta|esperar","confidence":0-100,"summary":"..."}`,
      }],
    });
    const text = message.content.find((b) => b.type === 'text')?.text || '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : MOCK_PICKS[symbol];
    return { symbol, ...parsed, mock: false, disclaimer: DISCLAIMER };
  }

  return { symbol, ...MOCK_PICKS[symbol], mock: true, disclaimer: DISCLAIMER };
}

async function refreshPicks() {
  for (const symbol of SYMBOLS) {
    try {
      const pick = await generatePick(symbol);
      store.addPick({ ...pick, createdAt: new Date().toISOString() });
    } catch (err) {
      console.error(`No se pudo generar el pick de ${symbol}:`, err.message);
    }
  }
}

function scheduleDailyPicks() {
  // Todos los días a las 08:00 (hora del servidor).
  cron.schedule('0 8 * * *', refreshPicks);
}

module.exports = { generatePick, refreshPicks, scheduleDailyPicks };
