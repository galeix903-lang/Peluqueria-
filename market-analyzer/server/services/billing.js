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
    await store.setUserPlan(user.id, targetPlan);
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
    await store.setUserPlan(user.id, 'free');
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

// Estado real de la suscripción directamente desde Stripe (no desde la
// copia local) — para la pantalla "Suscripción y facturación": si la
// copia local y Stripe alguna vez discreparan, esto es la fuente de
// verdad. En modo mock no hay nada real que consultar, se dice así.
async function getLiveSubscriptionDetails(user) {
  if (resolveBillingMode() !== 'live' || !user.stripeSubscriptionId) return null;
  const stripe = stripeClient();
  const sub = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
  return {
    status: sub.status,
    currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
  };
}

// Pagos reales del cliente (para el flujo de solicitud de reembolso) —
// nunca una lista inventada: en modo mock no existe ningún cargo real,
// así que se devuelve vacía con el motivo explícito.
async function listPaymentsForUser(user) {
  if (resolveBillingMode() !== 'live') {
    return { payments: [], note: 'Modo simulado: no hay pagos reales que listar.' };
  }
  if (!user.stripeCustomerId) {
    return { payments: [], note: 'Todavía no tienes ningún pago registrado.' };
  }
  const stripe = stripeClient();
  const charges = await stripe.charges.list({ customer: user.stripeCustomerId, limit: 20 });
  return {
    payments: charges.data.map((c) => ({
      chargeId: c.id,
      paymentIntentId: c.payment_intent || null,
      amount: c.amount / 100,
      currency: c.currency,
      status: c.status,
      refunded: c.refunded,
      amountRefunded: c.amount_refunded / 100,
      createdAt: new Date(c.created * 1000).toISOString(),
      description: c.description || null,
    })),
    note: null,
  };
}

// Ejecuta un reembolso REAL en Stripe — nunca se marca una solicitud como
// "reembolsada" sin pasar por aquí y sin comprobar la respuesta real.
// `idempotencyKey` (normalmente el id de la propia refund_request, que es
// estable) hace que un reintento del mismo reembolso — por un fallo de
// red justo después de que Stripe ya lo ejecutara, o porque el proceso se
// reinició entre "aprobado" y "guardado como procesado" — nunca cree un
// segundo reembolso real: Stripe devuelve el mismo resultado de la
// primera llamada en vez de repetir la operación.
async function createStripeRefund({ chargeId, paymentIntentId, amount, idempotencyKey }) {
  const stripe = stripeClient();
  const params = {};
  if (chargeId) params.charge = chargeId;
  else if (paymentIntentId) params.payment_intent = paymentIntentId;
  else throw new Error('Falta el id del cargo o del payment_intent a reembolsar.');
  if (amount != null) params.amount = Math.round(amount * 100);
  const options = idempotencyKey ? { idempotencyKey } : undefined;
  return stripe.refunds.create(params, options);
}

async function retrieveCharge(chargeId) {
  const stripe = stripeClient();
  return stripe.charges.retrieve(chargeId);
}

module.exports = {
  resolveBillingMode, createCheckoutSession, createPortalSession, verifyWebhookEvent, priceIdForPlan,
  getLiveSubscriptionDetails, listPaymentsForUser, createStripeRefund, retrieveCharge,
};
