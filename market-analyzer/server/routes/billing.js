const express = require('express');
const store = require('../store');
const billing = require('../services/billing');
const asyncHandler = require('../middleware/asyncHandler');

const router = express.Router();

function baseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

router.post('/checkout', asyncHandler(async (req, res) => {
  const user = await store.findUserById(req.userId);
  const plan = req.body && req.body.plan === 'plus' ? 'plus' : 'pro';
  try {
    const { url } = await billing.createCheckoutSession(user, baseUrl(req), plan);
    res.json({ url });
  } catch (err) {
    console.error('Error creando el checkout:', err.message);
    res.status(502).json({ error: 'No se pudo iniciar el pago. Inténtalo de nuevo en unos segundos.' });
  }
}));

router.post('/portal', asyncHandler(async (req, res) => {
  const user = await store.findUserById(req.userId);
  try {
    const { url } = await billing.createPortalSession(user, baseUrl(req));
    res.json({ url });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}));

// Estado real de la suscripción para la pantalla "Suscripción y
// facturación" — en modo live se consulta Stripe directamente (no solo la
// copia local) para que nunca se le muestre al usuario un estado que
// pueda haber quedado desincronizado.
router.get('/subscription', asyncHandler(async (req, res) => {
  const user = await store.findUserById(req.userId);
  const mode = billing.resolveBillingMode();
  let live = null;
  let liveCheckError = null;
  if (mode === 'live') {
    try {
      live = await billing.getLiveSubscriptionDetails(user);
    } catch (err) {
      liveCheckError = 'No se pudo confirmar el estado con Stripe en este momento; se muestra el último estado conocido.';
    }
  }
  res.json({
    mode,
    plan: user.plan,
    subscriptionStatus: live ? live.status : user.subscriptionStatus,
    currentPeriodEnd: live ? live.currentPeriodEnd : user.currentPeriodEnd,
    cancelAtPeriodEnd: live ? live.cancelAtPeriodEnd : user.cancelAtPeriodEnd,
    liveCheckError,
    note: mode === 'live'
      ? null
      : 'Modo simulado: no hay una suscripción real de Stripe detrás, el plan se cambia al instante para poder probar la app.',
  });
}));

router.get('/payments', asyncHandler(async (req, res) => {
  const user = await store.findUserById(req.userId);
  const result = await billing.listPaymentsForUser(user);
  res.json(result);
}));

router.get('/refund-requests', asyncHandler(async (req, res) => {
  res.json({ requests: await store.listRefundRequestsForUser(req.userId) });
}));

const REASON_CODES = new Set([
  'duplicate_charge', 'unauthorized_charge', 'technical_failure',
  'not_as_described', 'cancelled_before_renewal', 'other',
]);

router.post('/refund-requests', asyncHandler(async (req, res) => {
  const { chargeId, reasonCode, detail } = req.body || {};
  if (!chargeId || typeof chargeId !== 'string') {
    return res.status(400).json({ error: 'Falta el pago sobre el que quieres reclamar.' });
  }
  if (!REASON_CODES.has(reasonCode)) {
    return res.status(400).json({ error: 'Motivo no válido.' });
  }
  const user = await store.findUserById(req.userId);
  const mode = billing.resolveBillingMode();
  if (mode !== 'live') {
    return res.status(409).json({ error: 'Modo simulado: no hay pagos reales sobre los que abrir una solicitud de reembolso.' });
  }

  // Nunca se confía en un chargeId cualquiera venido del cliente: se
  // comprueba contra los pagos reales de ESTE usuario antes de registrar
  // nada, igual que cualquier otra comprobación de propiedad del proyecto.
  const { payments } = await billing.listPaymentsForUser(user);
  const charge = payments.find((p) => p.chargeId === chargeId);
  if (!charge) {
    return res.status(404).json({ error: 'Ese pago no existe o no pertenece a tu cuenta.' });
  }
  if (charge.refunded) {
    return res.status(409).json({ error: 'Ese pago ya está reembolsado por completo.' });
  }

  const detailTrimmed = typeof detail === 'string' ? detail.trim().slice(0, 1000) : null;
  const request = await store.createRefundRequest({
    userId: user.id,
    stripeChargeId: charge.chargeId,
    stripePaymentIntentId: charge.paymentIntentId,
    amount: charge.amount,
    currency: charge.currency,
    reasonCode,
    detail: detailTrimmed || null,
  });
  res.status(201).json({ request });
}));

// Manejador aparte para el webhook de Stripe: no lleva requireAuth (Stripe
// no manda cookie de sesión) y se monta en server/index.js con el cuerpo
// crudo, antes de express.json(), porque la verificación de firma
// necesita los bytes exactos que envió Stripe.
async function webhookHandler(req, res) {
  if (billing.resolveBillingMode() !== 'live') {
    // En modo mock no hay Stripe real que mande webhooks; se ignora.
    return res.status(200).end();
  }

  let event;
  try {
    event = billing.verifyWebhookEvent(req.body, req.headers['stripe-signature']);
  } catch (err) {
    console.error('Firma de webhook de Stripe inválida:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Idempotencia: Stripe puede reenviar el mismo evento más de una vez
  // (reintentos si la respuesta anterior no llegó a tiempo, o un reenvío
  // manual desde el Dashboard). Si ya se procesó este id, se responde 200
  // sin repetir ningún efecto — crítico sobre todo para charge.refunded y
  // charge.dispute.created, donde procesarlo dos veces podría duplicar
  // registros internos.
  if (await store.hasProcessedWebhookEvent(event.id)) {
    return res.status(200).end();
  }

  const eventCreatedAt = new Date(event.created * 1000).toISOString();

  // Importante: `markWebhookEventProcessed` solo se llama al final, tras
  // completar el bloque sin excepciones (nunca en un finally). Si algo
  // falla a mitad (p.ej. un error transitorio de la base de datos), el
  // evento NO se marca procesado, la petición responde con error (vía
  // asyncHandler) y Stripe lo reintentará más tarde con normalidad — si
  // se marcara procesado pase lo que pase, un fallo transitorio
  // "consumiría" el evento para siempre sin haber aplicado su efecto.
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const plan = session.metadata && session.metadata.plan === 'plus' ? 'plus' : 'pro';
    if (session.client_reference_id) {
      await store.applyBillingEvent(session.client_reference_id, {
        plan,
        subscriptionStatus: 'active',
        stripeCustomerId: session.customer,
        stripeSubscriptionId: session.subscription,
        eventCreatedAt,
      });
    }
  } else if (
    event.type === 'customer.subscription.created'
    || event.type === 'customer.subscription.updated'
    || event.type === 'customer.subscription.deleted'
  ) {
    // Se escuchan los tres: .created llega al dar de alta la suscripción
    // (a veces en el mismo segundo que checkout.session.completed, de ahí
    // el <= en applyBillingEvent) y es la única fuente de
    // current_period_end/cancel_at_period_end justo tras el alta —
    // checkout.session.completed no los trae. Sin escuchar .created,
    // esos dos campos podían quedarse en null hasta la primera
    // renovación o cambio de la suscripción.
    const subscription = event.data.object;
    const user = await store.findUserByStripeCustomerId(subscription.customer);
    if (user) {
      const stillActive = subscription.status === 'active' || subscription.status === 'trialing';
      const item = subscription.items && subscription.items.data && subscription.items.data[0];
      const priceId = item && item.price && item.price.id;
      const plan = stillActive
        ? (priceId && priceId === billing.priceIdForPlan('plus') ? 'plus' : 'pro')
        : 'free';
      await store.applyBillingEvent(user.id, {
        plan,
        subscriptionStatus: subscription.status,
        currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
        cancelAtPeriodEnd: !!subscription.cancel_at_period_end,
        eventCreatedAt,
      });
    }
  } else if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object;
    const user = await store.findUserByStripeCustomerId(invoice.customer);
    if (user) {
      // No se revoca el acceso aquí: Stripe sigue reintentando el cobro
      // durante su propio periodo de gracia y mandará
      // customer.subscription.updated con el estado final (past_due ->
      // active si se recupera, o canceled si no). Aquí solo se deja
      // constancia del estado para que la cuenta pueda avisarle al
      // usuario de que tiene un cobro pendiente que resolver.
      await store.applyBillingEvent(user.id, {
        subscriptionStatus: 'past_due',
        eventCreatedAt,
      });
    }
  } else if (event.type === 'charge.refunded') {
    const charge = event.data.object;
    const user = await store.findUserByStripeCustomerId(charge.customer);
    // Reconciliación: si el reembolso se originó desde el propio panel
    // de Stripe (no desde una solicitud de Vantex), no habrá una
    // refund_request previa — se registra igual para que quede
    // constancia, nunca se descarta silenciosamente.
    const requests = user ? await store.listRefundRequestsForUser(user.id) : [];
    const matching = requests.find((r) => r.stripeChargeId === charge.id && r.status !== 'processed');
    if (matching) {
      await store.resolveRefundRequest(matching.id, ['pending', 'under_review', 'approved'], {
        status: 'processed',
        adminNote: 'Confirmado por webhook de Stripe (charge.refunded).',
        stripeRefundId: charge.refunds && charge.refunds.data && charge.refunds.data[0] ? charge.refunds.data[0].id : null,
      });
    }
  } else if (event.type === 'charge.dispute.created') {
    const dispute = event.data.object;
    const chargeId = typeof dispute.charge === 'string' ? dispute.charge : (dispute.charge && dispute.charge.id);
    // El propio objeto Dispute no trae el cliente — hay que ir a buscar
    // el cargo original para saber de quién es, solo para poder
    // enlazarlo en el panel admin; si Stripe no respondiera por
    // cualquier motivo, se registra igual con userId null en vez de
    // perder constancia de la disputa.
    let userId = null;
    try {
      const charge = chargeId ? await billing.retrieveCharge(chargeId) : null;
      if (charge && charge.customer) {
        const user = await store.findUserByStripeCustomerId(charge.customer);
        if (user) userId = user.id;
      }
    } catch { /* se registra igual sin usuario asociado */ }
    await store.recordDispute({
      userId,
      stripeDisputeId: dispute.id,
      stripeChargeId: chargeId,
      amount: dispute.amount != null ? dispute.amount / 100 : null,
      currency: dispute.currency,
      reason: dispute.reason,
      status: dispute.status,
    });
  }

  // Se marca procesado solo tras llegar aquí sin ninguna excepción — ver
  // la nota de más arriba sobre por qué esto nunca va en un finally.
  await store.markWebhookEventProcessed(event.id, event.type);

  res.status(200).end();
}

module.exports = { router, webhookHandler };
