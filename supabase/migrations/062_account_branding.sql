-- ============================================================
-- 062_account_branding.sql — per-account brand assets for
-- professional email templates.
--
-- Adds three columns to `accounts`:
--   logo_url     public URL of the uploaded company logo
--   brand_name   display name printed in the email footer
--   brand_color  accent colour used in the email header rule
--
-- Creates the `branding` Supabase Storage bucket (public, so email
-- clients can fetch the logo over plain HTTPS — no signed URL).
--
-- Path convention used by the app:
--   branding/{account_id}/logo-<timestamp>.<ext>
-- The first path segment is the account id; uploads are restricted to
-- admins/owners of that account, reads are public.
--
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS brand_name TEXT,
  ADD COLUMN IF NOT EXISTS brand_color TEXT DEFAULT '#111827';

-- Server-side send path reads these columns to build the branded HTML.
COMMENT ON COLUMN accounts.logo_url   IS 'Public URL of the account company logo (branding bucket).';
COMMENT ON COLUMN accounts.brand_name IS 'Company name shown in email header/footer.';
COMMENT ON COLUMN accounts.brand_color IS 'Accent colour (hex) used in branded emails.';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'branding',
  'branding',
  TRUE,
  5242880, -- 5 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Branding logos are publicly readable" ON storage.objects;
CREATE POLICY "Branding logos are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'branding');

DROP POLICY IF EXISTS "Account admins can upload branding" ON storage.objects;
CREATE POLICY "Account admins can upload branding"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'branding'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.account_id::text = (storage.foldername(name))[1]
        AND p.account_role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Account admins can update branding" ON storage.objects;
CREATE POLICY "Account admins can update branding"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'branding'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.account_id::text = (storage.foldername(name))[1]
        AND p.account_role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Account admins can delete branding" ON storage.objects;
CREATE POLICY "Account admins can delete branding"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'branding'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.account_id::text = (storage.foldername(name))[1]
        AND p.account_role IN ('owner', 'admin')
    )
  );
