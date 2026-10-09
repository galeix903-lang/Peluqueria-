/*
  Tests contra la base de datos real (Postgres local de desarrollo, la
  misma que usa el servidor) — no se simula la capa de persistencia,
  porque la garantía que hay que probar (la guarda de orden en el propio
  UPDATE/WHERE) vive en el SQL, no en JS. Cada test crea su propio
  usuario de prueba para no interferir entre ellos ni con datos reales.
*/
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const db = require('../db');
const store = require('../store');

before(async () => { await db.migrate(); });
after(async () => { await db.pool.end(); });

async function makeUser() {
  const email = `billing-test-${crypto.randomUUID()}@test.local`;
  return store.createUser({ email, passwordHash: 'x', name: 'Test' });
}

describe('store.applyBillingEvent — guarda de orden (anti look-behind de webhooks)', () => {
  test('un evento más nuevo se aplica normalmente', async () => {
    const user = await makeUser();
    const applied = await store.applyBillingEvent(user.id, {
      plan: 'pro', subscriptionStatus: 'active', eventCreatedAt: new Date('2026-01-02').toISOString(),
    });
    assert.ok(applied);
    assert.equal(applied.plan, 'pro');
    assert.equal(applied.subscriptionStatus, 'active');
  });

  test('un evento más viejo que el ya aplicado se descarta sin tocar el estado', async () => {
    const user = await makeUser();
    await store.applyBillingEvent(user.id, {
      plan: 'pro', subscriptionStatus: 'active', eventCreatedAt: new Date('2026-01-05').toISOString(),
    });
    // Evento "atrasado" (p.ej. un reintento de Stripe que llega tarde, de
    // antes de la cancelación que ya se aplicó) — nunca debe poder revertir
    // un estado más reciente.
    const stale = await store.applyBillingEvent(user.id, {
      plan: 'free', subscriptionStatus: 'canceled', eventCreatedAt: new Date('2026-01-01').toISOString(),
    });
    assert.equal(stale, null, 'un evento más viejo debe devolver null (descartado), nunca aplicarse');
    const current = await store.findUserById(user.id);
    assert.equal(current.plan, 'pro', 'el plan no debe haber cambiado por el evento atrasado');
    assert.equal(current.subscriptionStatus, 'active');
  });

  test('eventos en orden correcto se van aplicando uno sobre otro', async () => {
    const user = await makeUser();
    await store.applyBillingEvent(user.id, { plan: 'pro', subscriptionStatus: 'active', eventCreatedAt: new Date('2026-02-01').toISOString() });
    await store.applyBillingEvent(user.id, { subscriptionStatus: 'past_due', eventCreatedAt: new Date('2026-02-15').toISOString() });
    const final = await store.applyBillingEvent(user.id, { plan: 'free', subscriptionStatus: 'canceled', eventCreatedAt: new Date('2026-03-01').toISOString() });
    assert.ok(final);
    assert.equal(final.plan, 'free');
    assert.equal(final.subscriptionStatus, 'canceled');
  });

  // Regresión del bug real encontrado en la segunda auditoría: el campo
  // `created` de Stripe solo tiene resolución de un segundo, y eventos
  // relacionados (checkout.session.completed + customer.subscription.
  // created de la misma alta) suelen compartir el mismo segundo. Con una
  // comparación estricta (<) el segundo evento se descartaba siempre,
  // aunque trajera datos nuevos y genuinos (current_period_end) que el
  // primero nunca trae — quedaban en null indefinidamente. La guarda
  // debe usar <=, no <.
  test('dos eventos con la MISMA marca de tiempo se aplican los dos (no se descarta el segundo)', async () => {
    const user = await makeUser();
    const sameInstant = new Date('2026-04-01T10:00:00.000Z').toISOString();
    const first = await store.applyBillingEvent(user.id, {
      plan: 'pro', subscriptionStatus: 'active', eventCreatedAt: sameInstant,
    });
    assert.ok(first, 'el primer evento del segundo debe aplicarse');
    // Segundo evento del MISMO segundo, con un dato que el primero nunca
    // trae (current_period_end) — si la guarda fuera estricta, esto se
    // perdería para siempre.
    const second = await store.applyBillingEvent(user.id, {
      currentPeriodEnd: new Date('2026-05-01T10:00:00.000Z').toISOString(),
      cancelAtPeriodEnd: false,
      eventCreatedAt: sameInstant,
    });
    assert.ok(second, 'un segundo evento del MISMO segundo no debe descartarse (resolución de Stripe es de 1s)');
    const current = await store.findUserById(user.id);
    assert.equal(current.plan, 'pro', 'el plan del primer evento se conserva (el segundo no lo toca)');
    assert.ok(current.currentPeriodEnd, 'current_period_end del segundo evento debe haberse guardado');
  });

  test('un evento de un segundo real anterior (no solo un empate) se sigue descartando con <=', async () => {
    const user = await makeUser();
    await store.applyBillingEvent(user.id, { plan: 'pro', eventCreatedAt: new Date('2026-06-10T00:00:00.000Z').toISOString() });
    const stale = await store.applyBillingEvent(user.id, { plan: 'free', eventCreatedAt: new Date('2026-06-09T23:59:59.000Z').toISOString() });
    assert.equal(stale, null, 'un evento de un segundo estrictamente anterior sigue descartándose con <=');
  });
});

describe('store — idempotencia de webhooks', () => {
  test('un evento no visto antes no está procesado; tras marcarlo, sí', async () => {
    const eventId = `evt_test_${crypto.randomUUID()}`;
    assert.equal(await store.hasProcessedWebhookEvent(eventId), false);
    await store.markWebhookEventProcessed(eventId, 'checkout.session.completed');
    assert.equal(await store.hasProcessedWebhookEvent(eventId), true);
  });

  test('marcar el mismo evento dos veces no lanza (ON CONFLICT DO NOTHING)', async () => {
    const eventId = `evt_test_${crypto.randomUUID()}`;
    await store.markWebhookEventProcessed(eventId, 'customer.subscription.updated');
    await assert.doesNotReject(() => store.markWebhookEventProcessed(eventId, 'customer.subscription.updated'));
  });
});

describe('store — solicitudes de reembolso: propiedad y transiciones atómicas', () => {
  test('findRefundRequestForUser nunca devuelve la solicitud de otro usuario', async () => {
    const owner = await makeUser();
    const intruder = await makeUser();
    const request = await store.createRefundRequest({
      userId: owner.id, stripeChargeId: 'ch_test_1', amount: 10, currency: 'eur', reasonCode: 'other',
    });
    const asOwner = await store.findRefundRequestForUser(request.id, owner.id);
    const asIntruder = await store.findRefundRequestForUser(request.id, intruder.id);
    assert.ok(asOwner);
    assert.equal(asIntruder, null, 'un usuario nunca debe poder leer la solicitud de otro por id');
  });

  test('resolveRefundRequest solo transiciona desde el estado esperado — una segunda resolución concurrente recibe null', async () => {
    const user = await makeUser();
    const request = await store.createRefundRequest({ userId: user.id, stripeChargeId: 'ch_test_2', amount: 5, currency: 'eur', reasonCode: 'other' });
    const first = await store.resolveRefundRequest(request.id, ['pending', 'under_review'], { status: 'approved', resolvedBy: user.id });
    assert.ok(first);
    assert.equal(first.status, 'approved');
    // Simula una segunda petición de aprobación llegando casi a la vez:
    // al ya no estar en pending/under_review, debe recibir null — nunca
    // debe poder re-procesar (y así re-reembolsar) la misma solicitud.
    const second = await store.resolveRefundRequest(request.id, ['pending', 'under_review'], { status: 'approved', resolvedBy: user.id });
    assert.equal(second, null, 'una solicitud ya aprobada no debe poder re-aprobarse de nuevo');
  });

  // Regresión del bug real encontrado en la segunda auditoría: si el
  // proceso se reinicia justo después de bloquear una solicitud en
  // 'approved' pero antes de llamar a Stripe (o si Stripe la rechaza y
  // queda en 'failed'), la ruta /approve debe poder reclamarla de nuevo
  // en vez de dejarla bloqueada para siempre sin ningún endpoint capaz
  // de tocarla.
  test('una solicitud atascada en "approved" o "failed" puede reclamarse de nuevo (rescate tras un fallo a medias)', async () => {
    const user = await makeUser();
    const request = await store.createRefundRequest({ userId: user.id, stripeChargeId: 'ch_test_stuck', amount: 7, currency: 'eur', reasonCode: 'other' });
    // Simula un intento anterior que bloqueó la solicitud y luego se
    // interrumpió (p.ej. el proceso murió antes de llamar a Stripe).
    const stuckApproved = await store.resolveRefundRequest(request.id, ['pending'], { status: 'approved', resolvedBy: user.id });
    assert.ok(stuckApproved);
    const reclaimedFromApproved = await store.resolveRefundRequest(request.id, ['pending', 'under_review', 'approved', 'failed'], { status: 'approved', resolvedBy: user.id });
    assert.ok(reclaimedFromApproved, 'debe poder reclamarse de nuevo desde "approved" para reintentar');

    // Simula ahora que Stripe rechazó el intento y quedó en 'failed'.
    const failed = await store.resolveRefundRequest(request.id, ['approved'], { status: 'failed', resolvedBy: user.id });
    assert.ok(failed);
    const reclaimedFromFailed = await store.resolveRefundRequest(request.id, ['pending', 'under_review', 'approved', 'failed'], { status: 'approved', resolvedBy: user.id });
    assert.ok(reclaimedFromFailed, 'debe poder reclamarse de nuevo desde "failed" para reintentar');

    // Un admin también debe poder rechazarla manualmente desde ese estado
    // atascado en vez de reintentar (vía el endpoint /status).
    const rejectedFromApproved = await store.resolveRefundRequest(reclaimedFromFailed.id, ['pending', 'under_review', 'approved', 'failed'], { status: 'rejected', resolvedBy: user.id });
    assert.ok(rejectedFromApproved);
    assert.equal(rejectedFromApproved.status, 'rejected');
  });

  test('una solicitud ya "processed" o "rejected" nunca puede reclamarse de nuevo', async () => {
    const user = await makeUser();
    const request = await store.createRefundRequest({ userId: user.id, stripeChargeId: 'ch_test_final', amount: 3, currency: 'eur', reasonCode: 'other' });
    await store.resolveRefundRequest(request.id, ['pending'], { status: 'processed', resolvedBy: user.id });
    const attempt = await store.resolveRefundRequest(request.id, ['pending', 'under_review', 'approved', 'failed'], { status: 'approved', resolvedBy: user.id });
    assert.equal(attempt, null, 'un estado terminal (processed) nunca debe poder reabrirse');
  });
});

describe('store — disputas: idempotencia por id de Stripe', () => {
  test('recordDispute con el mismo stripeDisputeId actualiza en vez de duplicar', async () => {
    const disputeId = `dp_test_${crypto.randomUUID()}`;
    await store.recordDispute({ stripeDisputeId: disputeId, amount: 20, currency: 'eur', reason: 'fraudulent', status: 'warning_needs_response' });
    await store.recordDispute({ stripeDisputeId: disputeId, amount: 20, currency: 'eur', reason: 'fraudulent', status: 'won' });
    const all = await store.listAllDisputes();
    const matches = all.filter((d) => d.stripeDisputeId === disputeId);
    assert.equal(matches.length, 1, 'el mismo id de disputa no debe crear una segunda fila');
    assert.equal(matches[0].status, 'won');
  });
});
