-- ============================================================
-- 061_smtp_configs.sql — per-account SMTP configuration for
-- free, server-side email broadcasts.
--
-- One row per account. The SMTP password is encrypted at rest
-- (AES-GCM via the same ENCRYPTION_KEY as whatsapp_config) so a
-- DB snapshot leak never exposes plaintext credentials.
--
-- This migration is idempotent (IF NOT EXISTS, DROP IF EXISTS).
-- ============================================================

CREATE TABLE IF NOT EXISTS smtp_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 587,
  smtp_user TEXT NOT NULL,
  password_encrypted TEXT NOT NULL,
  from_email TEXT NOT NULL,
  from_name TEXT,
  secure BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id)
);

CREATE INDEX IF NOT EXISTS idx_smtp_configs_account ON smtp_configs(account_id);

ALTER TABLE smtp_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS smtp_configs_select ON smtp_configs;
DROP POLICY IF EXISTS smtp_configs_modify ON smtp_configs;
CREATE POLICY smtp_configs_select ON smtp_configs FOR SELECT
  USING (is_account_member(account_id));
CREATE POLICY smtp_configs_modify ON smtp_configs FOR ALL
  USING (is_account_member(account_id, 'admin'))
  WITH CHECK (is_account_member(account_id, 'admin'));

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON smtp_configs;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON smtp_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
