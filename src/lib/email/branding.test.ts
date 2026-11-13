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
