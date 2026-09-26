-- Esquema inicial de Vantex en Postgres. Idempotente a propósito (ver
-- server/db.js: se ejecuta en cada arranque del servidor).

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  bio TEXT,
  avatar TEXT,
  balance NUMERIC NOT NULL DEFAULT 100000,
  plan TEXT NOT NULL DEFAULT 'free',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Único por email sin distinguir mayúsculas/minúsculas (mismo criterio
-- que usaba store.js con .toLowerCase()).
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users (lower(email));
CREATE INDEX IF NOT EXISTS users_stripe_customer_idx ON users (stripe_customer_id);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  -- Info del dispositivo/cliente, solo para que el usuario pueda ver
  -- "sesiones activas" más adelante — nunca se usa para autorizar nada.
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS refresh_tokens_hash_idx ON refresh_tokens (token_hash);

CREATE TABLE IF NOT EXISTS positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  size NUMERIC NOT NULL,
  entry_price NUMERIC NOT NULL,
  cost_basis NUMERIC,
  stop_loss NUMERIC,
  take_profit NUMERIC,
  status TEXT NOT NULL DEFAULT 'open',
  close_price NUMERIC,
  realized_pnl NUMERIC,
  close_reason TEXT,
  source TEXT,
  copied_from TEXT,
  opened_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS positions_user_idx ON positions (user_id, opened_at DESC);

-- analyses/picks: la forma exacta de un análisis de IA ha ido creciendo
-- orgánicamente (reasoning/isChart/support/resistance/summary/bias/
-- confidence/disclaimer/mock...) y seguirá cambiando; en vez de una
-- columna por campo (una migración cada vez que se añade uno), se
-- guarda como JSONB, igual de real y consultable que columnas propias,
-- pero sin fragilidad de esquema para algo que todavía evoluciona.
CREATE TABLE IF NOT EXISTS analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  timeframe TEXT,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analyses_user_idx ON analyses (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS picks_created_idx ON picks (created_at DESC);

CREATE TABLE IF NOT EXISTS tracked_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tracked_wallets_user_idx ON tracked_wallets (user_id, created_at);

CREATE TABLE IF NOT EXISTS copy_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trader_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, trader_id)
);
CREATE INDEX IF NOT EXISTS copy_follows_user_idx ON copy_follows (user_id);
