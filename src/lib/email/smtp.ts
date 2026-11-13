/**
 * SMTP email sending for free broadcast campaigns.
 *
 * Each account can store one SMTP configuration (host, port, user,
 * password, from address). The password is encrypted at rest with the
 * same AES-GCM key used for WhatsApp tokens, so a DB snapshot leak
 * never exposes plaintext credentials.
 *
 * Usage:
 *   1. User saves SMTP settings via POST /api/email/config
 *   2. Broadcast wizard calls POST /api/email/send for each recipient
 *      (or one bulk call), using the stored config.
 *   3. If no SMTP config exists, the wizard falls back to `mailto:`
 *      (already implemented).
 */

import nodemailer, { Transporter, SentMessageInfo } from 'nodemailer';
import type { SupabaseClient } from '@supabase/supabase-js';
import { decrypt } from '@/lib/whatsapp/encryption';

export interface SmtpConfigRow {
  id: string;
  account_id: string;
  host: string;
  port: number;
  smtp_user: string;
  password_encrypted: string;
  from_email: string;
  from_name?: string | null;
  secure: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * The sanitised config returned to the caller — never includes the
 * password.
 */
export interface SmtpConfigPublic {
  id: string;
  host: string;
  port: number;
  smtp_user: string;
  from_email: string;
  from_name?: string | null;
  secure: boolean;
}

/**
 * Load the account's SMTP config (without password) for display.
 */
export async function loadSmtpConfigPublic(
  supabase: SupabaseClient,
  accountId: string,
): Promise<SmtpConfigPublic | null> {
  const { data, error } = await supabase
    .from('smtp_configs')
    .select('id, host, port, smtp_user, from_email, from_name, secure')
    .eq('account_id', accountId)
    .maybeSingle();

  if (error || !data) return null;
  return data as SmtpConfigPublic;
}

/**
 * Load the account's SMTP config including the decrypted password and
 * build a Nodemailer transporter.
 *
 * Returns null when no SMTP is configured — caller falls back to `mailto:`.
 */
export async function loadSmtpTransporter(
  supabase: SupabaseClient,
  accountId: string,
): Promise<{
  transporter: Transporter;
  from: { email: string; name?: string | null };
} | null> {
  const { data, error } = await supabase
    .from('smtp_configs')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as SmtpConfigRow;
  const password = decrypt(row.password_encrypted);

  const transporter = nodemailer.createTransport({
    host: row.host,
    port: row.port,
    secure: row.secure,
    auth: { user: row.smtp_user, pass: password },
  });

  return {
    transporter,
    from: {
      email: row.from_email,
      name: row.from_name ?? null,
    },
  };
}

/**
 * Send a single email through the account's SMTP transporter.
 */
export async function sendSmtpEmail(
  transporter: Transporter,
  from: { email: string; name?: string | null },
  to: string,
  subject: string,
  text: string,
): Promise<{ messageId: string }> {
  const info = await transporter.sendMail({
    from: `"${from.name ?? ''}" <${from.email}>`,
    to,
    subject,
    text,
  });
  return { messageId: info.messageId };
}
