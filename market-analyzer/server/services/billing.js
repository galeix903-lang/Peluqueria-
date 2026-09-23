/*
  Suscripción de pago ("Vantex Pro"). Mismo patrón que
  services/claude.js: un modo "live" (Stripe de verdad) y un modo "mock"
  que simula el pago al instante, para poder construir y probar todo el
  paywall sin tener todavía una cuenta de Stripe. En cuanto se añadan
  STRIPE_SECRET_KEY/STRIPE_PRICE_ID/STRIPE_WEBHOOK_SECRET al entorno, pasa
  a cobrar de verdad sin tocar código.
*/
const store = require('../store');

function resolveBillingMode() {
  const configured = (process.env.BILLING_MODE || 'auto').toLowerCase();
  const hasKeys = !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_PRICE_ID;
  if (configured === 'mock') return 'mock';
  if (configured === 'live') return 'live';
  return hasKeys ? 'live' : 'mock';
}

function stripeClient() {
  const Stripe = require('stripe');
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

// Dos planes de pago con identificador interno 'plus'/'pro' (así están
// guardados en store.js y en el entorno de Render), aunque de cara al
// usuario se llaman "Pro" (1€/mes, STRIPE_PRICE_ID_PLUS) y "Business"
// (4,99€/mes, STRIPE_PRICE_ID — se mantiene el nombre de variable
// original para no romper el entorno de Render ya configurado).
function priceIdForPlan(plan) {
  return plan === 'plus' ? process.env.STRIPE_PRICE_ID_PLUS : process.env.STRIPE_PRICE_ID;
}

async function createCheckoutSession(user, baseUrl, plan = 'pro') {
  const targetPlan = plan === 'plus' ? 'plus' : 'pro';

  if (resolveBillingMode() !== 'live') {
    // Simula el pago entero al instante: no hay tarjeta ni Stripe de por
    // medio, solo se marca al usuario con el plan elegido directamente.
    store.setUserPlan(user.id, targetPlan);
    return { url: `${baseUrl}/dashboard?upgraded=${targetPlan}&mock=1` };
  }

  const priceId = priceIdForPlan(targetPlan);
  if (!priceId) {
    throw new Error(`Falta configurar STRIPE_PRICE_ID${targetPlan === 'plus' ? '_PLUS' : ''} para el plan "${targetPlan}".`);
  }

  const stripe = stripeClient();
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    // Solo tarjeta: sin esto, Stripe muestra automáticamente cualquier
    // método que esté activado en el Dashboard (incluidos Klarna,
    // Satispay...), poco reconocibles para dar confianza en un pago de
    // suscripción. Apple Pay/Google Pay siguen apareciendo solos encima
    // del formulario de tarjeta cuando el navegador los soporta.
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: user.id,
    // El webhook usa esto para saber a qué plan pasar al usuario cuando
    // se completa el pago (checkout.session.completed no lleva más pista
    // que esta sobre qué precio se compró).
    metadata: { plan: targetPlan },
    customer_email: user.email,
    success_url: `${baseUrl}/dashboard?upgraded=${targetPlan}`,
    cancel_url: `${baseUrl}/dashboard`,
    // Las cuentas nuevas de Stripe traen "Managed Payments" activado por
    // defecto, que exige un código de impuesto por producto (pensado para
    // marketplaces). Para una suscripción digital simple como esta, se
    // desactiva por sesión en vez de mantener códigos de impuesto en Stripe.
    managed_payments: { enabled: false },
  });
  return { url: session.url };
}

async function createPortalSession(user, baseUrl) {
  if (resolveBillingMode() !== 'live') {
    // No hay suscripción real que gestionar: el "portal" en modo mock es
    // simplemente volver a free, para poder probar el ciclo completo.
    store.setUserPlan(user.id, 'free');
    return { url: `${baseUrl}/dashboard?downgraded=1&mock=1` };
  }

  if (!user.stripeCustomerId) {
    throw new Error('Todavía no tienes una suscripción activa que gestionar.');
  }
  const stripe = stripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${baseUrl}/dashboard`,
  });
  return { url: session.url };
}

function verifyWebhookEvent(rawBody, signature) {
  const stripe = stripeClient();
  return stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
}

module.exports = { resolveBillingMode, createCheckoutSession, createPortalSession, verifyWebhookEvent, priceIdForPlan };
