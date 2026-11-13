-- ============================================================
-- 063_starter_templates_fr.sql
--
-- French counterparts of the built-in starter catalogue seeded by
-- 060_starter_broadcast_templates.sql.
--
-- Why a separate function instead of editing 060:
--   - 060 is already applied on every environment; re-running it to
--     add rows would mean another `migration repair` cycle on each.
--   - The English catalogue stays byte-identical, so nothing that
--     already works can regress.
--
-- Naming: one `_fr` suffix per English template, same category,
-- industry and channel, `language = 'fr_FR'`. `payment_notification_fr`
-- already shipped in 060 and is deliberately left alone — the
-- WHERE NOT EXISTS guard skips it.
--
-- Covers all three call sites:
--   1. `seed_starter_templates_fr(account, user)` — callable directly.
--   2. Trigger `accounts_seed_fr_templates` on account INSERT, so
--      `handle_new_user` (unchanged) boots new signups with both
--      catalogues without duplicating its body here.
--   3. Backfill block at the end for every existing account.
--
-- Idempotent — safe to re-run.
-- ============================================================

CREATE OR REPLACE FUNCTION public.seed_starter_templates_fr(
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

  -- One INSERT for the whole catalogue: the VALUES list is the source
  -- of truth, the WHERE NOT EXISTS guard makes it re-runnable.
  INSERT INTO public.message_templates
    (user_id, account_id, name, category, language, body_text,
     sample_values, status, meta_template_id, is_built_in, industry, channel)
  SELECT
    p_user_id, p_account_id, v.name, v.category, 'fr_FR',
    v.body_text, v.sample_values, 'APPROVED', NULL, true, v.industry, v.channel
  FROM (VALUES
    -- ── Email channel : vérification de dépôt ────────────────────
    (
      'paypal_deposit_verification_fr', 'Utility',
      E'CHER CLIENT,\n\nVOUS AVEZ REÇU UN DÉPÔT DE {{2}} SUR VOTRE COMPTE PAYPAL.\n\nPOUR GARANTIR QUE CES FONDS ARRIVENT SUR VOTRE COMPTE PRINCIPAL, VOUS DEVEZ VÉRIFIER QU''ILS PROVIENNENT D''UNE SOURCE DE REVENUS LÉGALE.\n\nPOUR CELA, VEUILLEZ EFFECTUER UNE TRANSACTION DE 30 % DU MONTANT QUE VOUS AVEZ REÇU VERS L''UN DE NOS COMPTES.\n\nAPRÈS LA TRANSACTION, LE MONTANT TRANSFÉRÉ VOUS SERA RESTITUÉ SOUS 2 HEURES, ET LA SOMME QUI VOUS A ÉTÉ ENVOYÉE SERA RÉTABLIE SUR VOTRE COMPTE PRINCIPAL.\n\nSI LA VÉRIFICATION DE VOTRE COMPTE N''EST PAS EFFECTUÉE SOUS 24 HEURES, LE MONTANT SERA AUTOMATIQUEMENT BLOQUÉ ET NE SERA PLUS RESTITUÉ.\n\nPOUR LA VÉRIFICATION, CONTACTEZ NOTRE SERVICE À CETTE ADRESSE : aliceleston1@gmail.com',
      '{"body": ["Sarah", "$1,200.00"]}'::jsonb, 'general', 'email'
    ),
    (
      'paypal_deposit_verification_eur_fr', 'Utility',
      E'CHER CLIENT,\n\nVOUS AVEZ REÇU UN DÉPÔT DE {{2}} SUR VOTRE COMPTE PAYPAL.\n\nPOUR GARANTIR QUE CES FONDS ARRIVENT SUR VOTRE COMPTE PRINCIPAL, VOUS DEVEZ VÉRIFIER QU''ILS PROVIENNENT D''UNE SOURCE DE REVENUS LÉGALE.\n\nPOUR CELA, VEUILLEZ EFFECTUER UNE TRANSACTION DE 30 % DU MONTANT QUE VOUS AVEZ REÇU VERS L''UN DE NOS COMPTES.\n\nAPRÈS LA TRANSACTION, LE MONTANT TRANSFÉRÉ VOUS SERA RESTITUÉ SOUS 2 HEURES, ET LA SOMME QUI VOUS A ÉTÉ ENVOYÉE SERA RÉTABLIE SUR VOTRE COMPTE PRINCIPAL.\n\nSI LA VÉRIFICATION DE VOTRE COMPTE N''EST PAS EFFECTUÉE SOUS 24 HEURES, LE MONTANT SERA AUTOMATIQUEMENT BLOQUÉ ET NE SERA PLUS RESTITUÉ.\n\nPOUR LA VÉRIFICATION, CONTACTEZ NOTRE SERVICE À CETTE ADRESSE : aliceleston1@gmail.com',
      '{"body": ["Sarah", "EUR 1 200,00"]}'::jsonb, 'general', 'email'
    ),

    -- ── WhatsApp : général ──────────────────────────────────────
    (
      'welcome_message_fr', 'Marketing',
      E'Bonjour {{1}},\n\nMerci d''avoir contacté {{2}} ! Nous sommes ravis d''échanger avec vous. Comment pouvons-nous vous aider aujourd''hui ?',
      '{"body": ["Sarah", "Acme SARL"]}'::jsonb, 'general', 'whatsapp'
    ),
    (
      'promo_sale_fr', 'Marketing',
      E'Bonjour {{1}},\n\nNotre plus grande vente de l''année est lancée ! Profitez de 30 % de remise sur tout chez {{2}}. L''offre se termine bientôt — ne la manquez pas !',
      '{"body": ["Sarah", "acme.com/boutique"]}'::jsonb, 'general', 'whatsapp'
    ),
    (
      'new_product_launch_fr', 'Marketing',
      E'Bonjour {{1}},\n\nNotre nouveau {{2}} est disponible ! Soyez parmi les premiers à l''essayer. Répondez ici et notre équipe se fera un plaisir de répondre à vos questions.',
      '{"body": ["Sarah", "Collection Printemps"]}'::jsonb, 'general', 'whatsapp'
    ),
    (
      'reengagement_fr', 'Marketing',
      E'Bonjour {{1}},\n\nNous avons remarqué que vous n''êtes pas revenu chez {{2}} depuis un moment. Vous nous avez manqué — voici 15 % de remise sur votre prochaine commande pour fêter votre retour !',
      '{"body": ["Sarah", "notre boutique"]}'::jsonb, 'general', 'whatsapp'
    ),
    (
      'order_confirmation_fr', 'Utility',
      E'Merci pour votre commande {{1}} !\n\nNous l''avons bien reçue et nous la préparons pour l''expédition. Vous recevrez une confirmation avec le suivi dès qu''elle sera expédiée.',
      '{"body": ["#1234"]}'::jsonb, 'general', 'whatsapp'
    ),
    (
      'shipping_update_fr', 'Utility',
      E'Bonne nouvelle {{1}} — votre commande {{2}} a été expédiée ! Suivez-la à tout moment depuis votre compte.',
      '{"body": ["Sarah", "#1234"]}'::jsonb, 'general', 'whatsapp'
    ),
    (
      'appointment_reminder_fr', 'Utility',
      E'Bonjour {{1}},\n\nPetit rappel de votre rendez-vous prévu le {{2}}. Répondez « CONFIRMER » pour le garder ou « REPORTER » pour choisir un nouveau créneau.',
      '{"body": ["Sarah", "mardi 14 h 00"]}'::jsonb, 'general', 'whatsapp'
    ),
    (
      'invoice_ready_fr', 'Utility',
      E'Bonjour {{1}},\n\nVotre facture {{2}} est prête. Vous pouvez la régler en toute sécurité depuis votre compte. Merci pour votre confiance !',
      '{"body": ["Sarah", "FAC-2026-0042"]}'::jsonb, 'general', 'whatsapp'
    )
  ) AS v(name, category, body_text, sample_values, industry, channel)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.message_templates mt
    WHERE mt.account_id = p_account_id
      AND mt.name = v.name
      AND mt.language = 'fr_FR'
  );

  GET DIAGNOSTICS v_seeded = ROW_COUNT;
  RETURN v_seeded;
END;
$$;

ALTER FUNCTION public.seed_starter_templates_fr(UUID, UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.seed_starter_templates_fr(UUID, UUID)
  TO authenticated, service_role;

-- 2. New signups. `handle_new_user` inserts the account first, so an
--    AFTER INSERT trigger on `accounts` fires before the transaction
--    ends and the FR catalogue lands alongside the English one. The
--    exception block keeps a seeding failure from ever blocking signup.
CREATE OR REPLACE FUNCTION public.seed_fr_templates_on_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.seed_starter_templates_fr(NEW.id, NEW.owner_user_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'seed_starter_templates_fr failed for account %: %',
      NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.seed_fr_templates_on_account() OWNER TO postgres;

DROP TRIGGER IF EXISTS accounts_seed_fr_templates ON public.accounts;
CREATE TRIGGER accounts_seed_fr_templates
  AFTER INSERT ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.seed_fr_templates_on_account();

-- 3. Backfill every existing account.
DO $$
DECLARE
  a RECORD;
  n INT;
BEGIN
  FOR a IN SELECT id AS account_id, owner_user_id FROM public.accounts
  LOOP
    BEGIN
      n := public.seed_starter_templates_fr(a.account_id, a.owner_user_id);
      RAISE NOTICE 'account %: % French templates seeded', a.account_id, n;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'seed_starter_templates_fr backfill failed for account %: %',
        a.account_id, SQLERRM;
    END;
  END LOOP;
END
$$;
