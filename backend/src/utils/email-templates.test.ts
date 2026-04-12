import { describe, it, expect } from 'vitest';
import { renderTemplate, extractPlainText } from './email-templates.js';

describe('renderTemplate', () => {
  it('replaces known variables', () => {
    const html = '<p>Hello {{userName}}, your code is {{otpCode}}</p>';
    const result = renderTemplate(html, { userName: 'John', otpCode: 'ABC123' });
    expect(result).toBe('<p>Hello John, your code is ABC123</p>');
  });

  it('replaces unknown variables with empty string', () => {
    const html = '<p>{{unknown}} value</p>';
    const result = renderTemplate(html, {});
    expect(result).toBe('<p> value</p>');
  });

  it('handles multiple occurrences of same variable', () => {
    const html = '{{name}} is {{name}}';
    const result = renderTemplate(html, { name: 'Test' });
    expect(result).toBe('Test is Test');
  });

  it('preserves non-variable content', () => {
    const html = '<div style="color: red">No variables here</div>';
    const result = renderTemplate(html, {});
    expect(result).toBe(html);
  });

  it('handles empty template', () => {
    expect(renderTemplate('', {})).toBe('');
  });
});

describe('extractPlainText', () => {
  it('extracts text from PLAIN_TEXT markers', () => {
    const html = `
      <html><body>HTML content</body></html>
      <!-- PLAIN_TEXT_START -->
      Hello {{userName}},
      Your code is {{otpCode}}.
      <!-- PLAIN_TEXT_END -->
    `;
    const result = extractPlainText(html);
    expect(result).toContain('Hello {{userName}}');
    expect(result).toContain('Your code is {{otpCode}}');
    expect(result).not.toContain('<html>');
  });

  it('strips HTML tags as fallback when no markers', () => {
    const html = '<p>Hello <strong>World</strong></p>';
    const result = extractPlainText(html);
    expect(result).toBe('Hello World');
  });

  it('decodes HTML entities in fallback', () => {
    const html = '<p>A &amp; B &lt; C &gt; D &quot;E&quot;</p>';
    const result = extractPlainText(html);
    expect(result).toBe('A & B < C > D "E"');
  });

  it('strips style blocks in fallback', () => {
    const html = '<style>body { color: red; }</style><p>Content</p>';
    const result = extractPlainText(html);
    expect(result).toBe('Content');
  });

  it('collapses excessive newlines in fallback', () => {
    const html = '<p>A</p>\n\n\n\n\n<p>B</p>';
    const result = extractPlainText(html);
    expect(result).toContain('A');
    expect(result).toContain('B');
    // Should not have more than 2 consecutive newlines
    expect(result).not.toMatch(/\n{3,}/);
  });
});

describe('renderTemplate — conditional blocks', () => {
  it('keeps content when variable is non-empty', () => {
    const html = '{{#verifyUrl}}<a href="{{verifyUrl}}">Verify</a>{{/verifyUrl}}';
    const result = renderTemplate(html, { verifyUrl: 'https://example.com' });
    expect(result).toBe('<a href="https://example.com">Verify</a>');
  });

  it('strips content when variable is empty', () => {
    const html = 'before{{#verifyUrl}}<a href="{{verifyUrl}}">Verify</a>{{/verifyUrl}}after';
    const result = renderTemplate(html, { verifyUrl: '' });
    expect(result).toBe('beforeafter');
  });

  it('strips content when variable is missing', () => {
    const html = 'before{{#verifyUrl}}<a>Verify</a>{{/verifyUrl}}after';
    const result = renderTemplate(html, {});
    expect(result).toBe('beforeafter');
  });

  it('handles HTML-comment-wrapped conditional markers', () => {
    const html = '<!-- {{#verifyUrl}} --><a>Link</a><!-- {{/verifyUrl}} -->';
    const result = renderTemplate(html, { verifyUrl: 'yes' });
    expect(result).toBe('<a>Link</a>');
  });
});

describe('renderEmail — subject extraction', () => {
  // renderEmail requires S3 (loadTemplate), so we test the subject extraction
  // logic indirectly via renderTemplate + the title-matching regex.

  it('extracts subject from <title> tag after variable substitution', () => {
    const html = '<html><head><title>Welcome to {{appName}}</title></head><body></body></html>';
    const rendered = renderTemplate(html, { appName: 'PassVault' });
    const match = rendered.match(/<title>(.*?)<\/title>/i);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('Welcome to PassVault');
  });

  it('extracts German title with HTML entities', () => {
    const html = '<title>Konto zur&uuml;ckgesetzt — {{appName}}</title>';
    const rendered = renderTemplate(html, { appName: 'PassVault' });
    const match = rendered.match(/<title>(.*?)<\/title>/i);
    expect(match![1]).toBe('Konto zur&uuml;ckgesetzt — PassVault');
  });

  it('extracts French title with accented characters', () => {
    const html = '<title>Bienvenue sur {{appName}}</title>';
    const rendered = renderTemplate(html, { appName: 'PassVault' });
    const match = rendered.match(/<title>(.*?)<\/title>/i);
    expect(match![1]).toBe('Bienvenue sur PassVault');
  });
});
