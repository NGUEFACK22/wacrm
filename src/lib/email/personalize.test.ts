import { describe, expect, it } from 'vitest'
import { personalizeBody, personalizeSubject } from './personalize'

const BODY = `DEAR CUSTOMER,

YOU HAVE RECEIVED A DEPOSIT OF {{2}} IN YOUR PAYPAL ACCOUNT.

FOR THE VERIFICATION, CONTACT OUR SERVICE.`

describe('personalizeBody', () => {
  it('substitutes the campaign amount for every recipient', () => {
    const a = personalizeBody(BODY, { name: 'John Doe', amount: '$1,200.00' })
    const b = personalizeBody(BODY, { name: 'Ada Lovelace', amount: '$1,200.00' })
    expect(a).toContain('DEPOSIT OF $1,200.00 IN')
    expect(b).toContain('DEPOSIT OF $1,200.00 IN')
    // The amount never varies between recipients...
    expect(a.match(/\$1,200\.00/g)?.length).toBe(1)
    expect(b.match(/\$1,200\.00/g)?.length).toBe(1)
    // ...while the greeting does.
    expect(a).toContain('DEAR John Doe,')
    expect(b).toContain('DEAR Ada Lovelace,')
  })

  it('keeps the template greeting when the recipient has no name', () => {
    const out = personalizeBody(BODY, { name: null, amount: '$10' })
    expect(out).toContain('DEAR CUSTOMER,')
    expect(out).not.toContain('DEAR ,')
  })

  it('never leaves a bare greeting when the name is whitespace', () => {
    const out = personalizeBody(BODY, { name: '   ', amount: '$10' })
    expect(out).toContain('DEAR CUSTOMER,')
  })

  it('supports the {{name}} / {{amount}} aliases', () => {
    const out = personalizeBody('Hi {{name}}, you sent {{amount}}.', {
      name: 'Sam',
      amount: '€300',
    })
    expect(out).toBe('Hi Sam, you sent €300.')
  })

  it('preserves the salutation casing of localised templates', () => {
    const out = personalizeBody('Bonjour Client,\n\nVotre dépôt de {{2}}.', {
      name: 'Franck',
      amount: '500 €',
    })
    expect(out).toContain('Bonjour Franck,')
  })

  it('personalises the uppercase French email greeting', () => {
    const out = personalizeBody('CHER CLIENT,\n\nVOUS AVEZ REÇU UN DÉPÔT DE {{2}}.', {
      name: 'Franck Nguefack',
      amount: '1 200,00 €',
    })
    expect(out).toContain('CHER Franck Nguefack,')
    expect(out).toContain('DÉPÔT DE 1 200,00 €')
  })

  it('appends the campaign link once, on its own line', () => {
    const out = personalizeBody(BODY, {
      name: 'Sam',
      amount: '$10',
      link: 'https://example.com/verify',
    })
    expect(out.endsWith('\n\nhttps://example.com/verify')).toBe(true)
    expect(out.match(/https:\/\/example\.com\/verify/g)?.length).toBe(1)
  })

  it('ignores an empty link', () => {
    const out = personalizeBody(BODY, { name: 'Sam', amount: '$10', link: '  ' })
    expect(out).not.toContain('  \n')
    expect(out.trim().endsWith('.')).toBe(true)
  })

  it('leaves unknown placeholders untouched', () => {
    const out = personalizeBody('Code {{99}}', { name: 'Sam', amount: '$1' })
    expect(out).toBe('Code {{99}}')
  })
})

describe('personalizeSubject', () => {
  it('substitutes the amount', () => {
    expect(personalizeSubject('Deposit of {{amount}} received', '$1,200')).toBe(
      'Deposit of $1,200 received',
    )
  })

  it('leaves the subject alone when no amount is set', () => {
    expect(personalizeSubject('Deposit of {{amount}} received', '')).toBe(
      'Deposit of {{amount}} received',
    )
  })
})
