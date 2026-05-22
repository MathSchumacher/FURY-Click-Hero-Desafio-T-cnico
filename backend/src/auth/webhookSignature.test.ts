import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  computeSignature,
  generateWebhookSecret,
  verifySignature,
} from './webhookSignature.js';

describe('generateWebhookSecret', () => {
  it('retorna base64url com pelo menos 32 chars', () => {
    const s = generateWebhookSecret();
    expect(s.length).toBeGreaterThanOrEqual(32);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('cada chamada retorna secret diferente (entropia)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(generateWebhookSecret());
    expect(seen.size).toBe(50);
  });
});

describe('computeSignature', () => {
  it('retorna hex lowercase de 64 chars (SHA-256 = 32 bytes)', () => {
    const sig = computeSignature('{"foo":"bar"}', 'secret');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it('mudança no body → assinatura diferente', () => {
    const a = computeSignature('{"foo":"bar"}', 'secret');
    const b = computeSignature('{"foo":"baz"}', 'secret');
    expect(a).not.toBe(b);
  });

  it('mudança no secret → assinatura diferente', () => {
    const a = computeSignature('{"foo":"bar"}', 'secret1');
    const b = computeSignature('{"foo":"bar"}', 'secret2');
    expect(a).not.toBe(b);
  });

  it('é compatível com createHmac SHA-256 padrão', () => {
    const body = 'hello world';
    const secret = 'my-secret';
    const expected = createHmac('sha256', secret).update(body).digest('hex');
    expect(computeSignature(body, secret)).toBe(expected);
  });
});

describe('verifySignature', () => {
  const body = '{"adId":"ad_1","tenantId":"t_1","violationType":"PROHIBITED_TERM","severity":"HIGH"}';
  const secret = 'shared-secret-123';
  const validHex = computeSignature(body, secret);

  it('aceita header válido (sha256=<hex>)', () => {
    expect(verifySignature(body, `sha256=${validHex}`, secret)).toBe(true);
  });

  it('rejeita header sem prefixo sha256=', () => {
    expect(verifySignature(body, validHex, secret)).toBe(false);
  });

  it('rejeita header undefined', () => {
    expect(verifySignature(body, undefined, secret)).toBe(false);
  });

  it('rejeita secret vazio', () => {
    expect(verifySignature(body, `sha256=${validHex}`, '')).toBe(false);
  });

  it('rejeita assinatura de outro body (tampering)', () => {
    const sigOfOtherBody = computeSignature('{"foo":"bar"}', secret);
    expect(verifySignature(body, `sha256=${sigOfOtherBody}`, secret)).toBe(false);
  });

  it('rejeita assinatura computada com secret errado', () => {
    const sigWithWrongSecret = computeSignature(body, 'wrong-secret');
    expect(verifySignature(body, `sha256=${sigWithWrongSecret}`, secret)).toBe(false);
  });

  it('rejeita hex de tamanho diferente (curto)', () => {
    expect(verifySignature(body, 'sha256=abc', secret)).toBe(false);
  });

  it('aceita Buffer no body (não só string)', () => {
    const buf = Buffer.from(body, 'utf-8');
    expect(verifySignature(buf, `sha256=${validHex}`, secret)).toBe(true);
  });

  it('case-insensitive no hex (uppercase também passa)', () => {
    expect(verifySignature(body, `sha256=${validHex.toUpperCase()}`, secret)).toBe(true);
  });
});
