/**
 * Account branding for outgoing email.
 *
 * When an account has a logo + brand name configured (Settings →
 * Branding), every broadcast / quick-send email is wrapped in a simple,
 * table-based HTML shell with the logo at the top and a footer line.
 * The plain-text body is preserved as the multipart `text` part, so
 * clients that refuse HTML still render fine.
 *
 * Email-client constraints that shaped this markup:
 *   - No external CSS (Gmail strips <style> in some contexts) → inline styles.
 *   - Tables for layout (Outlook ignores flex/grid).
 *   - Logo is a remote public URL (branding bucket is public).
 *   - Body keeps `white-space: pre-wrap` so newlines survive.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface AccountBranding {
  logo_url: string | null;
  brand_name: string | null;
  brand_color: string | null;
}

export const DEFAULT_BRAND_COLOR = '#111827';

/** Load the branding columns for an account. Returns nulls when absent. */
export async function loadAccountBranding(
  supabase: SupabaseClient,
  accountId: string,
): Promise<AccountBranding> {
  const { data } = await supabase
    .from('accounts')
    .select('logo_url, brand_name, brand_color')
    .eq('id', accountId)
    .maybeSingle();

  return {
    logo_url: data?.logo_url ?? null,
    brand_name: data?.brand_name ?? null,
    brand_color: data?.brand_color ?? DEFAULT_BRAND_COLOR,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only allow http(s) URLs into the `src`/`href` attributes. */
function safeUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Only allow `#rgb` / `#rrggbb` into the style attribute. */
function safeColor(value: string | null): string {
  if (value && /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(value)) return value;
  return DEFAULT_BRAND_COLOR;
}

/**
 * Escape plain-text body content and turn bare http(s) URLs into
 * clickable anchors. Runs after escaping, so the only markup produced
 * here is the anchor itself.
 */
function renderBodyHtml(text: string, color: string): string {
  const escaped = escapeHtml(text);
  return escaped.replace(/https?:\/\/[^\s<]+/g, (match) => {
    // Keep trailing punctuation outside the link — "see https://x.com."
    // should not link the period.
    const trailing = /[.,;:!?)\]]$/.exec(match)?.[0] ?? '';
    const url = trailing ? match.slice(0, -1) : match;
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:${color};text-decoration:underline;">${url}</a>${trailing}`;
  });
}

/**
 * Wrap a plain-text email body in a branded HTML shell.
 *
 * When the account has no logo and no brand name, returns `null` so the
 * caller sends plain text only (no pointless wrapper).
 */
export function buildBrandedHtml(
  text: string,
  branding: AccountBranding,
): string | null {
  const logo = safeUrl(branding.logo_url);
  const brandName = branding.brand_name?.trim() || null;
  if (!logo && !brandName) return null;

  const color = safeColor(branding.brand_color);
  const safeBrand = brandName ? escapeHtml(brandName) : '';
  const bodyHtml = renderBodyHtml(text, color);
  const year = new Date().getFullYear();

  const header = logo
    ? `<img src="${escapeHtml(logo)}" alt="${safeBrand}" width="180" style="display:block;max-height:64px;max-width:220px;width:auto;height:auto;border:0;outline:none;text-decoration:none;" />`
    : `<span style="font-size:18px;font-weight:600;color:${color};">${safeBrand}</span>`;

  const footer = safeBrand
    ? `<tr><td style="padding:16px 28px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.5;color:#6b7280;text-align:center;">
         &copy; ${year} ${safeBrand}
       </td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeBrand || 'Message'}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          <tr>
            <td style="height:4px;background-color:${color};line-height:4px;font-size:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px 28px;text-align:center;">
              ${header}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 28px 28px;">
              <div style="font-size:15px;line-height:1.65;color:#111827;white-space:pre-wrap;">${bodyHtml}</div>
            </td>
          </tr>
          ${footer}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
