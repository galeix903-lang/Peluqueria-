const express = require('express');
const store = require('../store');
const billing = require('../services/billing');

const router = express.Router();

function baseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

router.post('/checkout', async (req, res) => {
  const user = store.findUserById(req.session.userId);
  try {
    const { url } = await billing.createCheckoutSession(user, baseUrl(req));
    res.json({ url });
  } catch (err) {
    console.error('Error creando el checkout:', err.message);
    res.status(502).json({ error: 'No se pudo iniciar el pago. Inténtalo de nuevo en unos segundos.' });
  }
});

router.post('/portal', async (req, res) => {
  const user = store.findUserById(req.session.userId);
  try {
    const { url } = await billing.createPortalSession(user, baseUrl(req));
    res.json({ url });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Manejador aparte para el webhook de Stripe: no lleva requireAuth (Stripe
// no manda cookie de sesión) y se monta en server/index.js con el cuerpo
// crudo, antes de express.json(), porque la verificación de firma
// necesita los bytes exactos que envió Stripe.
function webhookHandler(req, res) {
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

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    if (session.client_reference_id) {
      store.setUserPlan(session.client_reference_id, 'pro', {
        stripeCustomerId: session.customer,
        stripeSubscriptionId: session.subscription,
      });
    }
  } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    const user = store.findUserByStripeCustomerId(subscription.customer);
    if (user) {
      const stillActive = subscription.status === 'active' || subscription.status === 'trialing';
      store.setUserPlan(user.id, stillActive ? 'pro' : 'free');
    }
  }

  res.status(200).end();
}

module.exports = { router, webhookHandler };
