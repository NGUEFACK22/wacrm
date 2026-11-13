import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'
import { getT } from '@/lib/i18n/translate'

const t = getT('Api')

/**
 * GET /api/email/config
 *
 * Return the account's SMTP configuration (password excluded).
 * Returns 200 with `config: null` when nothing is saved yet.
 * Requires 'admin' role — SMTP credentials are settings-class data.
 */
export async function GET() {
  try {
    const { supabase, accountId } = await requireRole('admin')

    const { data, error } = await supabase
      .from('smtp_configs')
      .select('id, host, port, smtp_user, from_email, from_name, secure, created_at, updated_at')
      .eq('account_id', accountId)
      .maybeSingle()

    if (error) {
      return NextResponse.json(
        { error: t('email.configLoadFailed') },
        { status: 500 },
      )
    }

    return NextResponse.json({ config: data ?? null })
  } catch (error) {
    return toErrorResponse(error)
  }
}
