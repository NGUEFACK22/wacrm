import { describe, expect, it } from 'vitest';
import { buildBrandedHtml, DEFAULT_BRAND_COLOR } from './branding';

const empty = { logo_url: null, brand_name: null, brand_color: null };

describe('buildBrandedHtml', () => {
  it('returns null when the account has no logo and no brand name', () => {
    expect(buildBrandedHtml('hello', empty)).toBeNull();
  });

  it('renders the logo as the header image', () => {
    const html = buildBrandedHtml('hello', {
      logo_url: 'https://cdn.example.com/logo.png',
      brand_name: 'Acme',
      brand_color: '#2563eb',
    });
    expect(html).toContain('https://cdn.example.com/logo.png');
    expect(html).toContain('#2563eb');
    expect(html).toContain('Acme');
  });

  it('falls back to the brand name when no logo is set', () => {
    const html = buildBrandedHtml('hello', {
      logo_url: null,
      brand_name: 'Acme',
      brand_color: '#2563eb',
    });
    expect(html).toContain('Acme');
    expect(html).not.toContain('<img');
  });

  it('escapes HTML in the plain-text body', () => {
    const html = buildBrandedHtml('<script>alert(1)</script>', {
      logo_url: null,
      brand_name: 'Acme',
      brand_color: '#111827',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('refuses non-http(s) logo URLs', () => {
    const html = buildBrandedHtml('hello', {
      logo_url: 'javascript:alert(1)',
      brand_name: 'Acme',
      brand_color: '#111827',
    });
    expect(html).not.toContain('javascript:');
  });

  it('turns bare http(s) URLs in the body into anchors', () => {
    const html = buildBrandedHtml('Pay here: https://pay.example.com/inv/42', {
      logo_url: null,
      brand_name: 'Acme',
      brand_color: '#2563eb',
    });
    expect(html).toContain(
      '<a href="https://pay.example.com/inv/42" target="_blank" rel="noopener noreferrer"',
    );
  });

  it('does not swallow trailing punctuation into the link', () => {
    const html = buildBrandedHtml('Open https://example.com.', {
      logo_url: null,
      brand_name: 'Acme',
      brand_color: '#111827',
    });
    expect(html).toContain('>https://example.com</a>.');
  });

  it('never linkifies javascript: or escaped markup', () => {
    const html = buildBrandedHtml('javascript:alert(1) <b>x</b>', {
      logo_url: null,
      brand_name: 'Acme',
      brand_color: '#111827',
    });
    expect(html).not.toContain('<a href="javascript');
    expect(html).not.toContain('<b>');
  });

  it('replaces an invalid accent colour with the default', () => {
    const html = buildBrandedHtml('hello', {
      logo_url: null,
      brand_name: 'Acme',
      brand_color: 'red; background:url(x)',
    });
    expect(html).toContain(DEFAULT_BRAND_COLOR);
    expect(html).not.toContain('background:url');
  });
});

describe('buildBrandedHtml campaign hero image', () => {
  const HERO = 'https://cdn.example.com/campaign/hero.png';

  it('renders the hero image above the body', () => {
    const html = buildBrandedHtml('hello', {
      logo_url: 'https://cdn.example.com/logo.png',
      brand_name: 'Acme',
      brand_color: '#111827',
    }, { heroImageUrl: HERO });

    expect(html).toContain(HERO);
    // Hero sits between the brand header and the body paragraph.
    expect(html!.indexOf(HERO)).toBeGreaterThan(
      html!.indexOf('https://cdn.example.com/logo.png'),
    );
    expect(html!.indexOf(HERO)).toBeLessThan(html!.indexOf('hello'));
  });

  it('builds a shell for an unbranded account when only a hero is set', () => {
    const html = buildBrandedHtml('hello', empty, { heroImageUrl: HERO });
    expect(html).not.toBeNull();
    expect(html).toContain(HERO);
    expect(html).toContain('hello');
  });

  it('still returns null with neither branding nor a hero', () => {
    expect(buildBrandedHtml('hello', empty, { heroImageUrl: null })).toBeNull();
    expect(buildBrandedHtml('hello', empty, { heroImageUrl: '   ' })).toBeNull();
  });

  it('refuses a non-http(s) hero URL', () => {
    const html = buildBrandedHtml('hello', {
      logo_url: null,
      brand_name: 'Acme',
      brand_color: '#111827',
    }, { heroImageUrl: 'javascript:alert(1)' });

    expect(html).not.toContain('javascript:');
    expect(html).toContain('Acme');
  });

  it('escapes the hero alt text', () => {
    const html = buildBrandedHtml('hello', empty, {
      heroImageUrl: HERO,
      heroAlt: '" onerror="alert(1)',
    });
    expect(html).not.toContain('onerror="alert(1)"');
    expect(html).toContain('&quot; onerror=&quot;alert(1)');
  });
});
