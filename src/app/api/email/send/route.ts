import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'
import {
  loadSmtpTransporter,
  sendSmtpEmail,
} from '@/lib/email/smtp'
import {
  buildBrandedHtml,
  loadAccountBranding,
} from '@/lib/email/branding'
import { personalizeBody } from '@/lib/email/personalize'
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit'
import { getT } from '@/lib/i18n/translate'

const t = getT('Api')

interface SendRecipient {
  to: string
  name?: string | null
}

/**
 * The display name lands in a mail header (`From: "Name" <addr>`), so
 * strip CR/LF and control characters — otherwise a newline in the name
 * lets the caller inject extra headers (Bcc, Reply-To, ...).
 */
function sanitizeDisplayName(value: string | undefined | null): string | null {
  if (!value) return null
  const cleaned = value
    .replace(/[\r\n\u0000-\u001f\u007f]/g, ' ')
    .replace(/["\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  return cleaned || null
}

/**
 * POST /api/email/send
 *
 * Send one or more emails through the account's configured SMTP.
 * Falls back gracefully when no SMTP is configured.
 *
 * Body:
 *   {
 *     recipients: [{ to: string, name?: string }],
 *     subject: string,
 *     text: string,
 *     fromName?: string,   // display name the recipient sees, overrides SMTP
 *     personalize?: {
 *       amount?: string,   // campaign constant → {{2}} / {{amount}}
 *       link?: string,     // campaign constant, appended to every body
 *     },
 *   }
 *
 * With `personalize`, `text` is a template: `{{1}}` / `{{name}}` and the
 * "DEAR CUSTOMER," greeting resolve per recipient, while `amount` and
 * `link` stay identical for the whole campaign.
 *
 * Requires 'agent' role — sending email is a write operation.
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('agent')

    const limit = checkRateLimit(`email-send:${userId}`, RATE_LIMITS.broadcast)
    if (!limit.success) return rateLimitResponse(limit)

    let body: {
      recipients?: SendRecipient[]
      subject?: string
      text?: string
      fromName?: string
      personalize?: { amount?: string; link?: string }
    }
    try {
      body = (await request.json()) as typeof body
    } catch {
      return NextResponse.json({ error: t('email.invalidJsonBody') }, { status: 400 })
    }

    const recipients = body.recipients ?? []
    const subject = body.subject ?? ''
    const text = body.text ?? ''
    // Sender display name for this send. Falls back to the SMTP default.
    const fromNameOverride = sanitizeDisplayName(body.fromName)

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json(
        { error: t('email.recipientsRequired') },
        { status: 400 },
      )
    }
    if (!subject) {
      return NextResponse.json({ error: t('email.subjectRequired') }, { status: 400 })
    }

    // Load SMTP config. When none is configured, we tell the caller to
    // fall back to `mailto:` (already implemented in the wizard).
    const smtp = await loadSmtpTransporter(supabase, accountId)
    if (!smtp) {
      return NextResponse.json(
        { error: t('email.smtpNotConfigured'), fallback: 'mailto' },
        { status: 400 },
      )
    }

    // Brand the message once: logo header + footer when the account has
    // configured branding, otherwise plain text only.
    const branding = await loadAccountBranding(supabase, accountId)

    // Campaign-level values. Same for every recipient by design — only
    // the name resolves per recipient.
    const personalize = body.personalize
    const amount = personalize?.amount ?? null
    const link = personalize?.link ?? null

    // Without personalization the body is identical for everyone, so the
    // branded HTML is built once instead of per recipient.
    const sharedHtml = personalize ? null : buildBrandedHtml(text, branding)

    const results: Array<{ to: string; status: 'sent' | 'failed'; messageId?: string; error?: string }> = []
    let sentCount = 0
    let failedCount = 0

    for (const recipient of recipients) {
      const { to, name } = recipient
      if (!to) continue

      // `{{name}}` in the override lets one send address every recipient
      // by their own name ("Service client de Acme — Jean").
      const personalizedFrom = fromNameOverride
        ? sanitizeDisplayName(
            fromNameOverride.replace(/\{\{\s*name\s*\}\}/gi, name?.trim() || ''),
          )
        : null

      try {
        const recipientText = personalize
          ? personalizeBody(text, { name, amount, link })
          : text
        const recipientHtml = personalize
          ? buildBrandedHtml(recipientText, branding)
          : sharedHtml

        const { messageId } = await sendSmtpEmail(
          smtp.transporter,
          { email: smtp.from.email, name: personalizedFrom ?? smtp.from.name },
          to,
          subject,
          recipientText,
          recipientHtml,
        )
        results.push({ to, status: 'sent', messageId })
        sentCount++
      } catch (err) {
        const message = err instanceof Error ? err.message : t('email.unknownError')
        results.push({ to, status: 'failed', error: message })
        failedCount++
        console.error(`SMTP send failed to ${to}:`, message)
      }
    }

    return NextResponse.json({
      success: failedCount === 0,
      total: recipients.length,
      sent: sentCount,
      failed: failedCount,
      results,
    })
  } catch (error) {
    console.error('Error sending email:', error)
    return toErrorResponse(error)
  }
}
