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
