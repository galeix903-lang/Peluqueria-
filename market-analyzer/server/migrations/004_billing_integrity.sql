-- Fase de pagos: estado real de la suscripción + idempotencia de webhooks
-- + solicitudes de reembolso + control admin mínimo.

-- Estado de la suscripción que Stripe ya manda en sus eventos pero que
-- hasta ahora se descartaba por completo — sin esto, Vantex no puede
-- mostrarle al usuario si su renovación falló, si ya tiene la cancelación
-- programada, o para cuándo es la próxima renovación.
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT false;
-- Marca temporal del evento de Stripe (su propio `created`, no la hora de
-- recepción) que escribió por última vez el estado de facturación de este
-- usuario — permite descartar un evento que llega tarde pero es más viejo
-- que el que ya se aplicó, en vez de dejar que un reenvío fuera de orden
-- pise un estado más reciente.
ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_last_event_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- Idempotencia de webhooks: cada evento de Stripe tiene un id único
-- (evt_...) que es estable entre reintentos/reenvíos del mismo evento.
-- Guardarlo antes de darlo por procesado permite detectar un reenvío
-- exacto y no repetir su efecto (muy relevante para charge.refunded y
-- charge.dispute.created, donde "procesarlo dos veces" sí podría crear
-- registros duplicados).
CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Solicitudes de reembolso: el usuario abre una contra un cargo real
-- (identificado por su id de Stripe, nunca inventado), un admin la
-- resuelve ejecutando la operación real en Stripe — nunca se marca
-- "reembolsado" sin que Stripe lo confirme.
CREATE TABLE IF NOT EXISTS refund_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_charge_id TEXT,
  stripe_payment_intent_id TEXT,
  amount NUMERIC,
  currency TEXT,
  reason_code TEXT NOT NULL,
  detail TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending|under_review|approved|processed|rejected|failed
  admin_note TEXT,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  stripe_refund_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS refund_requests_user_idx ON refund_requests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS refund_requests_status_idx ON refund_requests (status);

-- Disputas/chargebacks registrados desde el webhook — solo lectura para
-- un admin, nunca una acción automática (una disputa la resuelve el
-- propio flujo de Stripe/el banco, Vantex solo necesita verla).
CREATE TABLE IF NOT EXISTS payment_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  stripe_dispute_id TEXT NOT NULL UNIQUE,
  stripe_charge_id TEXT,
  amount NUMERIC,
  currency TEXT,
  reason TEXT,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
