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

async function createCheckoutSession(user, baseUrl) {
  if (resolveBillingMode() !== 'live') {
    // Simula el pago entero al instante: no hay tarjeta ni Stripe de por
    // medio, solo se marca al usuario como Pro directamente.
    store.setUserPlan(user.id, 'pro');
    return { url: `${baseUrl}/dashboard?upgraded=1&mock=1` };
  }

  const stripe = stripeClient();
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    client_reference_id: user.id,
    customer_email: user.email,
    success_url: `${baseUrl}/dashboard?upgraded=1`,
    cancel_url: `${baseUrl}/dashboard`,
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

module.exports = { resolveBillingMode, createCheckoutSession, createPortalSession, verifyWebhookEvent };
