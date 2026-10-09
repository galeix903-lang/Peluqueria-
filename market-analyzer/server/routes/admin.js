const express = require('express');
const store = require('../store');
const billing = require('../services/billing');
const asyncHandler = require('../middleware/asyncHandler');

// Panel admin mínimo pero real: nunca "marca" una solicitud como resuelta
// sin ejecutar la operación de verdad en Stripe cuando corresponde. Se
// monta en server/index.js detrás de requireAuth + requireAdmin — ningún
// endpoint de aquí es alcanzable sin ambos.
const router = express.Router();

router.get('/refund-requests', asyncHandler(async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  res.json({ requests: await store.listAllRefundRequests({ status }) });
}));

router.get('/disputes', asyncHandler(async (req, res) => {
  res.json({ disputes: await store.listAllDisputes() });
}));

// 'approved' y 'failed' se incluyen como origen de 'rejected'/'under_review'
// a propósito: son los dos estados en los que una solicitud puede quedar
// "atascada" si un intento de aprobación se interrumpe (el proceso se
// reinicia justo tras bloquearla, o Stripe la rechaza) — sin esto, un
// admin no tendría ninguna forma de rescatarla manualmente, porque
// /approve solo vuelve a intentar desde esos mismos estados (ver abajo).
const VALID_TRANSITIONS = {
  under_review: ['pending', 'failed'],
  rejected: ['pending', 'under_review', 'approved', 'failed'],
};

// Mueve la solicitud a "en revisión" o la rechaza — ninguna de las dos
// toca Stripe, son estados puramente internos.
router.post('/refund-requests/:id/status', asyncHandler(async (req, res) => {
  const { status, adminNote } = req.body || {};
  if (!VALID_TRANSITIONS[status]) {
    return res.status(400).json({ error: 'Transición de estado no válida desde este endpoint.' });
  }
  const updated = await store.resolveRefundRequest(req.params.id, VALID_TRANSITIONS[status], {
    status, adminNote: typeof adminNote === 'string' ? adminNote.slice(0, 1000) : null, resolvedBy: req.adminUser.id,
  });
  if (!updated) {
    return res.status(409).json({ error: 'La solicitud ya no está en un estado desde el que se pueda hacer esta transición (puede que otra persona ya la haya resuelto).' });
  }
  res.json({ request: updated });
}));

// Aprobar de verdad: ejecuta el reembolso REAL en Stripe y solo entonces
// marca la solicitud como procesada — si Stripe lo rechaza, queda en
// "failed" con el motivo, nunca "processed" sin que el dinero se haya
// movido de verdad.
router.post('/refund-requests/:id/approve', asyncHandler(async (req, res) => {
  const request = await store.findRefundRequestById(req.params.id);
  if (!request) return res.status(404).json({ error: 'Solicitud no encontrada.' });
  if (['processed', 'rejected'].includes(request.status)) {
    return res.status(409).json({ error: `Esta solicitud ya está en estado "${request.status}", no se puede volver a aprobar.` });
  }
  if (billing.resolveBillingMode() !== 'live') {
    return res.status(409).json({ error: 'Modo simulado: no hay ninguna pasarela real con la que ejecutar un reembolso.' });
  }

  // Se bloquea aquí mismo (-> approved) ANTES de llamar a Stripe, para
  // que dos aprobaciones casi simultáneas no puedan las dos intentar
  // reembolsar el mismo cargo — solo una gana la transición atómica, la
  // otra recibe null y debe parar ahí. 'approved'/'failed' como origen
  // válido permite reclamar y reintentar una solicitud que quedó a
  // medias en un intento anterior (proceso reiniciado o Stripe la
  // rechazó) sin dejarla bloqueada para siempre.
  const locked = await store.resolveRefundRequest(request.id, ['pending', 'under_review', 'approved', 'failed'], {
    status: 'approved', resolvedBy: req.adminUser.id,
  });
  if (!locked) {
    return res.status(409).json({ error: 'Otra persona ya está resolviendo esta solicitud.' });
  }

  try {
    // idempotencyKey = el id de la propia solicitud: estable entre
    // reintentos de ESTA solicitud concreta, así que si este es un
    // reintento tras un fallo a medias, Stripe no vuelve a mover dinero
    // una segunda vez — devuelve el resultado del intento anterior.
    const refund = await billing.createStripeRefund({
      chargeId: request.stripeChargeId,
      paymentIntentId: request.stripePaymentIntentId,
      amount: request.amount,
      idempotencyKey: request.id,
    });
    const final = await store.resolveRefundRequest(request.id, ['approved'], {
      status: 'processed', resolvedBy: req.adminUser.id, stripeRefundId: refund.id,
      adminNote: req.body && typeof req.body.adminNote === 'string' ? req.body.adminNote.slice(0, 1000) : null,
    });
    res.json({ request: final });
  } catch (err) {
    console.error('Error ejecutando el reembolso en Stripe:', err.message);
    const failed = await store.resolveRefundRequest(request.id, ['approved'], {
      status: 'failed', resolvedBy: req.adminUser.id, adminNote: `Stripe rechazó el reembolso: ${err.message}`,
    });
    res.status(502).json({ error: `Stripe rechazó el reembolso: ${err.message}`, request: failed });
  }
}));

module.exports = router;
