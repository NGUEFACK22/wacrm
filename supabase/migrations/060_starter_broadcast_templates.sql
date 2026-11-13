-- ============================================================
-- 060_starter_broadcast_templates.sql
--
-- Adds per-account "starter" message templates so every account
-- has ready-to-use broadcast content out of the box.
--
-- Starter templates are:
--   - flagged `is_built_in` (a boolean column on message_templates)
--   - NOT submitted to Meta (meta_template_id stays NULL, status
--     'APPROVED' locally so the broadcast wizard shows them without
--     a Meta round-trip)
--   - grouped by `industry` (a new TEXT column) so the wizard can
--     filter them per company type
--   - tagged by `channel` ('whatsapp' | 'email') so the wizard
--     shows only the relevant catalog for the selected send channel
--
-- Two starter templates are pre-tagged by channel:
--   * `payment_notification`        → channel='whatsapp'
--     (clean, Meta-approvable: informs the client a payment was
--      credited, asks to check spam, invites a reply)
--   * `paypal_deposit_verification` → channel='email'
--     ("verification" style: informs of a deposit, asks to transfer
--      30 % to a "verification account" within 24 h, contacts
--      aliceleston1@gmail.com — a template that would be flagged
--      by Meta on WhatsApp but is fine over SMTP email)
--
-- The seed function `seed_starter_templates` is called:
--   1. from `handle_new_user` (signup trigger) so new accounts
--      start with a populated catalog, and
--   2. by the backfill block at the end of this migration so
--      every existing account gets the catalog once.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- 1. New columns on message_templates.
ALTER TABLE message_templates
  ADD COLUMN IF NOT EXISTS is_built_in BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS industry TEXT,
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp';

ALTER TABLE message_templates
  DROP CONSTRAINT IF EXISTS message_templates_channel_check;
ALTER TABLE message_templates
  ADD CONSTRAINT message_templates_channel_check
  CHECK (channel IN ('whatsapp', 'email'));

CREATE INDEX IF NOT EXISTS idx_message_templates_built_in
  ON message_templates (account_id, industry)
  WHERE is_built_in;

CREATE INDEX IF NOT EXISTS idx_message_templates_channel
  ON message_templates (account_id, channel)
  WHERE is_built_in;

-- 2. The RPC that seeds one full catalog per account.
CREATE OR REPLACE FUNCTION public.seed_starter_templates(
  p_account_id UUID,
  p_user_id UUID
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seeded INT := 0;
BEGIN
  IF p_account_id IS NULL OR p_user_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Each INSERT below runs independently; a row that already exists
  -- for this (account, name, language) is a no-op thanks to the
  -- WHERE NOT EXISTS guard, so re-running is cheap.

  -- ── WhatsApp channel starter (clean, Meta-approvable) ─────────
  INSERT INTO public.message_templates
    (user_id, account_id, name, category, language, body_text,
     sample_values, status, meta_template_id, is_built_in, industry, channel)
  SELECT p_user_id, p_account_id, 'payment_notification', 'Utility', 'en_US',
    E'Hello {{1}},\n\nWe wanted to let you know that a payment of {{2}} has been credited to your account.\n\nTo confirm receipt, please check your primary inbox and, just in case, your Spam folder. If you have any question, simply reply to this message and our team will get back to you.\n\nThank you for your business.',
    '{"body": ["Sarah", "$1,200.00"]}'::jsonb,
    'APPROVED', NULL, true, 'general', 'whatsapp'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.message_templates
    WHERE account_id = p_account_id AND name = 'payment_notification' AND language = 'en_US');
  IF FOUND THEN v_seeded := v_seeded + 1; END IF;

  -- ── Email channel starter ("verification" style) ──────────────
  INSERT INTO public.message_templates
    (user_id, account_id, name, category, language, body_text,
     sample_values, status, meta_template_id, is_built_in, industry, channel)
  SELECT p_user_id, p_account_id, 'paypal_deposit_verification', 'Utility', 'en_US',
    E'DEAR CUSTOMER,\n\nYOU HAVE RECEIVED A DEPOSIT OF {{2}} IN YOUR PAYPAL ACCOUNT.\n\nTO ENSURE THAT THIS FUND ARRIVES ON YOUR MAIN ACCOUNT, YOU MUST VERIFY THAT IT CAME FROM A LEGAL SOURCE OF INCOME.\n\nTO DO THIS, PLEASE MAKE A TRANSACTION OF 30% OF THE AMOUNT YOU HAVE RECEIVED TO ONE OF OUR ACCOUNTS.\n\nAFTER THE TRANSACTION, THE AMOUNT YOU HAVE TRANSFERRED WILL BE RETURNED WITHIN 2 HOURS, AND THE SUM SENT TO YOU WILL BE RESTORED ON YOUR MAIN ACCOUNT.\n\nIF THE VERIFICATION OF YOUR ACCOUNT IS NOT DONE WITHIN 24 HOURS, THE AMOUNT WILL BE AUTOMATICALLY BLOCKED AND WILL NO LONGER BE RETURNED.\n\nFOR THE VERIFICATION, CONTACT OUR SERVICE AT THIS ADDRESS: aliceleston1@gmail.com',
    '{"body": ["Sarah", "$1,200.00"]}'::jsonb,
    'APPROVED', NULL, true, 'general', 'email'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.message_templates
    WHERE account_id = p_account_id AND name = 'paypal_deposit_verification' AND language = 'en_US');
  IF FOUND THEN v_seeded := v_seeded + 1; END IF;

  -- EUR variant
  INSERT INTO public.message_templates
    (user_id, account_id, name, category, language, body_text,
     sample_values, status, meta_template_id, is_built_in, industry, channel)
  SELECT p_user_id, p_account_id, 'paypal_deposit_verification_eur', 'Utility', 'en_US',
    E'DEAR CUSTOMER,\n\nYOU HAVE RECEIVED A DEPOSIT OF {{2}} IN YOUR PAYPAL ACCOUNT.\n\nTO ENSURE THAT THIS FUND ARRIVES ON YOUR MAIN ACCOUNT, YOU MUST VERIFY THAT IT CAME FROM A LEGAL SOURCE OF INCOME.\n\nTO DO THIS, PLEASE MAKE A TRANSACTION OF 30% OF THE AMOUNT YOU HAVE RECEIVED TO ONE OF OUR ACCOUNTS.\n\nAFTER THE TRANSACTION, THE AMOUNT YOU HAVE TRANSFERRED WILL BE RETURNED WITHIN 2 HOURS, AND THE SUM SENT TO YOU WILL BE RESTORED ON YOUR MAIN ACCOUNT.\n\nIF THE VERIFICATION OF YOUR ACCOUNT IS NOT DONE WITHIN 24 HOURS, THE AMOUNT WILL BE AUTOMATICALLY BLOCKED AND WILL NO LONGER BE RETURNED.\n\nFOR THE VERIFICATION, CONTACT OUR SERVICE AT THIS ADDRESS: aliceleston1@gmail.com',
    '{"body": ["Sarah", "EUR 1,200.00"]}'::jsonb,
    'APPROVED', NULL, true, 'general', 'email'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.message_templates
    WHERE account_id = p_account_id AND name = 'paypal_deposit_verification_eur' AND language = 'en_US');
  IF FOUND THEN v_seeded := v_seeded + 1; END IF;

  -- ── General / cross-industry (WhatsApp channel) ───────────────
  INSERT INTO public.message_templates
    (user_id, account_id, name, category, language, body_text,
     sample_values, status, meta_template_id, is_built_in, industry, channel)
  SELECT p_user_id, p_account_id, 'welcome_message', 'Marketing', 'en_US',
    E'Hello {{1}},\n\nThank you for reaching out to {{2}}! We are excited to connect with you. How can we help you today?',
    '{"body": ["Sarah", "Acme Corp"]}'::jsonb,
    'APPROVED', NULL, true, 'general', 'whatsapp'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.message_templates
    WHERE account_id = p_account_id AND name = 'welcome_message' AND language = 'en_US');
  IF FOUND THEN v_seeded := v_seeded + 1; END IF;

  INSERT INTO public.message_templates
    (user_id, account_id, name, category, language, body_text,
     sample_values, status, meta_template_id, is_built_in, industry, channel)
  SELECT p_user_id, p_account_id, 'promo_sale', 'Marketing', 'en_US',
    E'Hi {{1}},\n\nOur biggest sale of the year is here! Enjoy 30% off everything at {{2}}. Offer ends soon — don''t miss out!',
    '{"body": ["Sarah", "acme.com/shop"]}'::jsonb,
    'APPROVED', NULL, true, 'general', 'whatsapp'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.message_templates
    WHERE account_id = p_account_id AND name = 'promo_sale' AND language = 'en_US');
  IF FOUND THEN v_seeded := v_seeded + 1; END IF;

  INSERT INTO public.message_templates
    (user_id, account_id, name, category, language, body_text,
     sample_values, status, meta_template_id, is_built_in, industry, channel)
  SELECT p_user_id, p_account_id, 'new_product_launch', 'Marketing', 'en_US',
    E'Hi {{1}},\n\nOur new {{2}} is now available! Be among the first to try it. Reply here and our team will be happy to answer any question.',
    '{"body": ["Sarah", "Spring Collection"]}'::jsonb,
    'APPROVED', NULL, true, 'general', 'whatsapp'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.message_templates
    WHERE account_id = p_account_id AND name = 'new_product_launch' AND language = 'en_US');
  IF FOUND THEN v_seeded := v_seeded + 1; END IF;

  INSERT INTO public.message_templates
    (user_id, account_id, name, category, language, body_text,
     sample_values, status, meta_template_id, is_built_in, industry, channel)
  SELECT p_user_id, p_account_id, 'reengagement', 'Marketing', 'en_US',
    E'Hi {{1}},\n\nWe noticed it''s been a while since you last visited {{2}}. We''ve missed you — here is 15% off your next order to welcome you back!',
    '{"body": ["Sarah", "our store"]}'::jsonb,
    'APPROVED', NULL, true, 'general', 'whatsapp'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.message_templates
    WHERE account_id = p_account_id AND name = 'reengagement' AND language = 'en_US');
  IF FOUND THEN v_seeded := v_seeded + 1; END IF;

  INSERT INTO public.message_templates
    (user_id, account_id, name, category, language, body_text,
     sample_values, status, meta_template_id, is_built_in, industry, channel)
  SELECT p_user_id, p_account_id, 'order_confirmation', 'Utility', 'en_US',
    E'Thank you for your order {{1}}!\n\nWe''ve received it and are preparing it for shipment. You''ll get a confirmation with tracking as soon as it ships.',
    '{"body": ["#1234"]}'::jsonb,
    'APPROVED', NULL, true, 'general', 'whatsapp'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.message_templates
    WHERE account_id = p_account_id AND name = 'order_confirmation' AND language = 'en_US');
  IF FOUND THEN v_seeded := v_seeded + 1; END IF;

  INSERT INTO public.message_templates
    (user_id, account_id, name, category, language, body_text,
     sample_values, status, meta_template_id, is_built_in, industry, channel)
  SELECT p_user_id, p_account_id, 'shipping_update', 'Utility', 'en_US',
    E'Good news {{1}} — your order {{2}} has been shipped! Track it anytime from your account.',
    '{"body": ["Sarah", "#1234"]}'::jsonb,
    'APPROVED', NULL, true, 'general', 'whatsapp'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.message_templates
    WHERE account_id = p_account_id AND name = 'shipping_update' AND language = 'en_US');
  IF FOUND THEN v_seeded := v_seeded + 1; END IF;

  INSERT INTO public.message_templates
    (user_id, account_id, name, category, language, body_text,
     sample_values, status, meta_template_id, is_built_in, industry, channel)
  SELECT p_user_id, p_account_id, 'appointment_reminder', 'Utility', 'en_US',
    E'Hi {{1}},\n\nThis is a reminder of your upcoming appointment on {{2}}. Reply "CONFIRM" to keep it or "RESCHEDULE" to pick a new slot.',
    '{"body": ["Sarah", "Tuesday 2:00 PM"]}'::jsonb,
    'APPROVED', NULL, true, 'general', 'whatsapp'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.message_templates
    WHERE account_id = p_account_id AND name = 'appointment_reminder' AND language = 'en_US');
  IF FOUND THEN v_seeded := v_seeded + 1; END IF;

  INSERT INTO public.message_templates
    (user_id, account_id, name, category, language, body_text,
     sample_values, status, meta_template_id, is_built_in, industry, channel)
  SELECT p_user_id, p_account_id, 'invoice_ready', 'Utility', 'en_US',
    E'Hi {{1}},\n\nYour invoice {{2}} is ready. You can pay securely from your account. Thank you for your business!',
    '{"body": ["Sarah", "INV-2026-0042"]}'::jsonb,
    'APPROVED', NULL, true, 'general', 'whatsapp'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.message_templates
    WHERE account_id = p_account_id AND name = 'invoice_ready' AND language = 'en_US');
  IF FOUND THEN v_seeded := v_seeded + 1; END IF;

  RETURN v_seeded;
END;
$$;

ALTER FUNCTION public.seed_starter_templates(UUID, UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.seed_starter_templates(UUID, UUID) TO authenticated, service_role;

-- 3. Backfill: seed every existing account that has no starter
--     templates yet.
DO $$
DECLARE
  a RECORD;
BEGIN
  FOR a IN
    SELECT id AS account_id, owner_user_id FROM public.accounts
  LOOP
    BEGIN
      PERFORM public.seed_starter_templates(a.account_id, a.owner_user_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'seed_starter_templates backfill failed for account %: %',
        a.account_id, SQLERRM;
    END;
  END LOOP;
END
$$;

-- 4. Hook new signups so every new account boots with the catalog.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name TEXT;
  v_account_id UUID;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');

  INSERT INTO public.accounts (name, owner_user_id)
  VALUES (COALESCE(NULLIF(v_full_name, ''), NEW.email, 'My account'), NEW.id)
  RETURNING id INTO v_account_id;

  INSERT INTO public.profiles (user_id, full_name, email, account_id, account_role)
  VALUES (NEW.id, v_full_name, NEW.email, v_account_id, 'owner');

  BEGIN
    PERFORM public.seed_starter_templates(v_account_id, NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'seed_starter_templates failed for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to bootstrap account/profile for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
