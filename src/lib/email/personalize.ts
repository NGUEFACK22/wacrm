/**
 * Per-recipient rendering of a campaign body.
 *
 * The contract this encodes — and the reason it exists as a separate
 * module — is the split dj asked for: a campaign has ONE amount and ONE
 * link (campaign-level constants), and the only thing that varies from
 * one recipient to the next is personal data, in practice the name.
 *
 * Placeholder vocabulary:
 *   {{1}} / {{name}}     → recipient name          (per recipient)
 *   {{2}} / {{amount}}   → campaign amount         (global)
 *
 * Built-in starter templates greet with the literal `DEAR CUSTOMER,`
 * instead of a placeholder. That greeting is rewritten to the recipient
 * name when one is known — which is the whole point of a mail merge —
 * and left untouched when the contact has no name, so we never ship
 * "DEAR ,".
 */

export interface PersonalizeVars {
  /** Recipient name. `null` / empty keeps the template greeting. */
  name?: string | null
  /** Campaign-level amount — same value for every recipient. */
  amount?: string | null
  /** Optional campaign-level link, appended as a trailing line. */
  link?: string | null
}

const AMOUNT_TOKEN = /\{\{\s*(?:2|amount)\s*\}\}/gi
const NAME_TOKEN = /\{\{\s*(?:1|name)\s*\}\}/gi

/**
 * Salutation on the first word of a line: "DEAR CUSTOMER,",
 * "Dear Client,", "Bonjour Client,". Group 1 keeps the salutation and
 * its spacing so casing survives.
 */
const GREETING =
  /^([ \t]*(?:dear|hello|hi|bonjour|salut|cher|ch[eè]re)[ \t]+)(?:customer|client|client\(e\)|sir\/madam|monsieur|madame)[ \t]*,/gim

/** Render one recipient's body. Amount and link are campaign constants. */
export function personalizeBody(body: string, vars: PersonalizeVars): string {
  const amount = vars.amount?.trim() ?? ''
  const name = vars.name?.trim() ?? ''
  const link = vars.link?.trim() ?? ''

  let out = body.replace(AMOUNT_TOKEN, amount)

  if (name) {
    out = out
      .replace(NAME_TOKEN, name)
      .replace(GREETING, (_match, salutation: string) => `${salutation}${name},`)
  }

  if (link) out = `${out.replace(/\s+$/, '')}\n\n${link}`

  return out
}

/** Subject line: only the campaign-level amount is substituted. */
export function personalizeSubject(subject: string, amount: string | null | undefined): string {
  const value = amount?.trim() ?? ''
  return value ? subject.replace(AMOUNT_TOKEN, value) : subject
}
