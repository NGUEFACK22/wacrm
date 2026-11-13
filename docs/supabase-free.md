# Running on the Supabase Free plan

wacrm is designed to run entirely on a Supabase **Free** project — no paid
tier is required. The database, auth, storage, and realtime features used
here are all included in the free plan.

## What you get for free

- **Postgres** — 500 MB database, plus the `pgvector` extension that the
  AI knowledge base uses for semantic search (included on the free plan).
- **Auth** — email/password sign-up, confirmation and password-reset
  emails, sessions. Enough for a team of agents.
- **Storage** — 1 GB. That covers the `avatars` and `chat-media` buckets
  (attachments you receive from WhatsApp are copied here so they outlive
  Meta's ~30-day retention).
- **Realtime** — the channels the dashboard uses for presence, unread
  counts, reactions, and notifications.

## Setting up your free project

1. Create a project at https://supabase.com (free tier).
2. Apply the schema:
   - Easiest: use the Supabase CLI
     (`supabase link` against your project, then `supabase db push`), or
   - Paste `supabase/migrations/*.sql` in order through the SQL editor
     in the dashboard (Settings → Database → migrations, or the SQL tab).
3. In `.env.local` (copy from `.env.local.example`):
   - `NEXT_PUBLIC_SUPABASE_URL` — your project's URL
     (Project Settings → API).
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the `anon` key.
   - `SUPABASE_SERVICE_ROLE_KEY` — the `service_role` key. **Keep this
     secret; never ship it to the browser.** It's used by server routes
     (webhook, automation engine, public API key auth).
4. Generate `ENCRYPTION_KEY` (64 hex chars):
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Rotating this key later orphans every WhatsApp token encrypted under
   the previous value — users would have to reconnect their number.
5. Set `META_APP_SECRET` from your Meta App (WhatsApp Business API) so
   inbound webhooks verify correctly.

## Free-plan limits to keep in mind

- **500 MB Postgres / 1 GB storage** — fine for a small team; watch the
  `chat-media` bucket if you get high inbound attachment volume, and you
  can turn off attachment mirroring per account under Settings →
  WhatsApp → Attachment Storage.
- **Free projects can pause.** Supabase may put idle free projects to
  sleep; when that happens the app's requests fail until you (or a
  scheduled touch) wakes the project. If you rely on the automation cron
  endpoints (`/api/automations/cron`, `/api/flows/cron`), make sure the
  project is awake when the scheduler fires, or point the scheduler at a
  warm instance.
- **Email delivery** — sign-up confirmation and password-reset emails
  go out through Supabase's SMTP. On the free plan, check
  Authentication → Providers → Email so the links point at *your* domain
  (see `docs/auth-emails.md`); otherwise they default to `localhost`.
- **Realtime** works on the free plan; a large number of concurrent
  agent sessions can hit connection limits, but a normal team is well
  within it.

No other configuration is needed — the app reads everything from the
environment variables above and the database.
