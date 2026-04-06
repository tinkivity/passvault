import { describe, it, expect } from 'vitest';
import { isValidTemplateType, isValidLanguage } from './template-s3.js';
import { EMAIL_TEMPLATE_CONFIG, TEMPLATE_VARIABLES, COMMON_TEMPLATE_VARIABLES } from '@passvault/shared';

describe('isValidTemplateType', () => {
  it('accepts all configured template types', () => {
    for (const type of EMAIL_TEMPLATE_CONFIG.TEMPLATE_TYPES) {
      expect(isValidTemplateType(type)).toBe(true);
    }
  });

  it('rejects unknown types', () => {
    expect(isValidTemplateType('nonexistent')).toBe(false);
    expect(isValidTemplateType('')).toBe(false);
    expect(isValidTemplateType('INVITATION')).toBe(false);
  });

  it('rejects path traversal strings', () => {
    expect(isValidTemplateType('../etc/passwd')).toBe(false);
    expect(isValidTemplateType('invitation/../secret')).toBe(false);
  });

  it('rejects types with special characters', () => {
    expect(isValidTemplateType('invitation<script>')).toBe(false);
    expect(isValidTemplateType('invitation; rm -rf')).toBe(false);
  });
});

describe('isValidLanguage', () => {
  it('accepts all configured languages', () => {
    for (const lang of EMAIL_TEMPLATE_CONFIG.SUPPORTED_LANGUAGES) {
      expect(isValidLanguage(lang)).toBe(true);
    }
  });

  it('rejects unknown language codes', () => {
    expect(isValidLanguage('xx')).toBe(false);
    expect(isValidLanguage('')).toBe(false);
    expect(isValidLanguage('EN')).toBe(false);
    expect(isValidLanguage('english')).toBe(false);
  });

  it('rejects path traversal strings', () => {
    expect(isValidLanguage('../')).toBe(false);
    expect(isValidLanguage('en/../secret')).toBe(false);
  });
});

describe('shared template constants', () => {
  it('TEMPLATE_VARIABLES covers all template types', () => {
    for (const type of EMAIL_TEMPLATE_CONFIG.TEMPLATE_TYPES) {
      expect(TEMPLATE_VARIABLES[type]).toBeDefined();
      expect(Array.isArray(TEMPLATE_VARIABLES[type])).toBe(true);
    }
  });

  it('COMMON_TEMPLATE_VARIABLES includes expected globals', () => {
    expect(COMMON_TEMPLATE_VARIABLES).toContain('appName');
    expect(COMMON_TEMPLATE_VARIABLES).toContain('appUrl');
    expect(COMMON_TEMPLATE_VARIABLES).toContain('year');
  });

  it('invitation template has userName and otpCode', () => {
    const vars = TEMPLATE_VARIABLES['invitation'];
    expect(vars).toContain('userName');
    expect(vars).toContain('otpCode');
  });

  it('vault-backup template has unsubscribeUrl', () => {
    const vars = TEMPLATE_VARIABLES['vault-backup'];
    expect(vars).toContain('unsubscribeUrl');
  });
});
