import { describe, expect, it } from 'vitest';
import { IN_FLIGHT_STATES, isInFlight } from './_jobState.js';

describe('isInFlight', () => {
  it.each(['waiting', 'active', 'delayed', 'waiting-children'] as const)(
    'reconhece "%s" como in-flight',
    (s) => {
      expect(isInFlight(s)).toBe(true);
    },
  );

  it.each(['completed', 'failed', 'unknown'] as const)('reconhece "%s" como NÃO in-flight', (s) => {
    expect(isInFlight(s)).toBe(false);
  });

  it('exporta a lista canônica de estados (4)', () => {
    expect(IN_FLIGHT_STATES).toHaveLength(4);
  });
});
