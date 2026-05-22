import { describe, expect, it } from 'vitest';
import { buildJobId, jobOptionsFor } from './jobOptions.js';

describe('buildJobId — idempotency key', () => {
  it('produz o mesmo id pra mesmo (tenantId, adId)', () => {
    const a = buildJobId('ad_42', 'tenant_xyz');
    const b = buildJobId('ad_42', 'tenant_xyz');
    expect(a).toBe(b);
    expect(a).toBe('tenant_xyz__ad_42');
  });

  it('produz ids distintos para tenants diferentes', () => {
    expect(buildJobId('ad_1', 'tenant_a')).not.toBe(buildJobId('ad_1', 'tenant_b'));
  });

  it('produz ids distintos para ads diferentes no mesmo tenant', () => {
    expect(buildJobId('ad_1', 'tenant_a')).not.toBe(buildJobId('ad_2', 'tenant_a'));
  });
});

describe('jobOptionsFor — severity-based routing', () => {
  it('CRITICAL → priority mais alta (menor número) + mais tentativas', () => {
    const c = jobOptionsFor('CRITICAL');
    const l = jobOptionsFor('LOW');
    expect(c.priority).toBeLessThan(l.priority!);
    expect(c.attempts).toBeGreaterThan(l.attempts!);
  });

  it('ordem de prioridade: CRITICAL < HIGH < MEDIUM < LOW', () => {
    const c = jobOptionsFor('CRITICAL').priority!;
    const h = jobOptionsFor('HIGH').priority!;
    const m = jobOptionsFor('MEDIUM').priority!;
    const lo = jobOptionsFor('LOW').priority!;
    expect(c).toBeLessThan(h);
    expect(h).toBeLessThan(m);
    expect(m).toBeLessThan(lo);
  });

  it('todos os níveis mantêm backoff exponencial', () => {
    for (const sev of ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const) {
      const opts = jobOptionsFor(sev);
      expect(opts.backoff).toEqual({ type: 'exponential', delay: 1000 });
    }
  });

  it('LOW e MEDIUM mantêm os 3 attempts default do desafio', () => {
    expect(jobOptionsFor('LOW').attempts).toBe(3);
    expect(jobOptionsFor('MEDIUM').attempts).toBe(3);
  });
});
