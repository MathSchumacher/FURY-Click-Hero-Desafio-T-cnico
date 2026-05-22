import { describe, expect, it } from 'vitest';
import { violationPayloadSchema } from './violation.js';

describe('violationPayloadSchema', () => {
  const validBase = {
    adId: 'ad_001',
    tenantId: 'tenant_acme',
    violationType: 'PROHIBITED_TERM',
    severity: 'HIGH',
    detectedAt: '2026-05-21T14:23:01Z',
  };

  it('aceita payload válido', () => {
    const r = violationPayloadSchema.safeParse(validBase);
    expect(r.success).toBe(true);
  });

  it('rejeita adId vazio', () => {
    const r = violationPayloadSchema.safeParse({ ...validBase, adId: '' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.adId).toBeDefined();
    }
  });

  it('rejeita violationType fora do enum', () => {
    const r = violationPayloadSchema.safeParse({ ...validBase, violationType: 'INVALID' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.violationType).toBeDefined();
    }
  });

  it('rejeita severity fora do enum', () => {
    const r = violationPayloadSchema.safeParse({ ...validBase, severity: 'SEVERE' });
    expect(r.success).toBe(false);
  });

  it('rejeita detectedAt que não é ISO 8601', () => {
    const r = violationPayloadSchema.safeParse({ ...validBase, detectedAt: '2026-05-21 14:23' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.detectedAt).toBeDefined();
    }
  });

  it('rejeita campos não declarados (strict)', () => {
    const r = violationPayloadSchema.safeParse({ ...validBase, extraField: 'foo' });
    expect(r.success).toBe(false);
  });

  it('aceita todos os 4 severities e 3 violation types', () => {
    for (const severity of ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const) {
      for (const violationType of [
        'PROHIBITED_TERM',
        'BRAND_VIOLATION',
        'COMPLIANCE_FAIL',
      ] as const) {
        const r = violationPayloadSchema.safeParse({ ...validBase, severity, violationType });
        expect(r.success).toBe(true);
      }
    }
  });
});
