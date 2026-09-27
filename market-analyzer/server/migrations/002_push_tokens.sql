-- Fase 5: tokens de notificaciones push (Expo Push Notifications).
-- Un usuario puede tener varios tokens (varios dispositivos); el token
-- en sí ya identifica el dispositivo+instalación, así que es único.
CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS push_tokens_token_idx ON push_tokens (token);
CREATE INDEX IF NOT EXISTS push_tokens_user_idx ON push_tokens (user_id);
