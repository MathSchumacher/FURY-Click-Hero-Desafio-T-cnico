import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
    testTimeout: 10_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      /* Scope = challenge core only.
         Exclusions: tests themselves, app wiring (index/worker.ts),
         I/O singletons (config, Redis-coupled queue instance), and the
         optional auth/dashboard bonus that's outside the challenge. */
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/index.ts',
        'src/worker.ts',
        'src/config/**',
        'src/auth/**',
        'src/lib/logger.ts',
        'src/routes/auth.ts',
        'src/queue/violationQueue.ts',
        /* Factories that only spin up when given a real Redis connection — */
        /* exercised by the E2E suite (testcontainers). Excluded from local */
        /* unit coverage where Docker may not be present.                    */
        'src/queue/factory.ts',
        'src/worker/createWorker.ts',
      ],
      thresholds: {
        lines: 90,
        functions: 95,
        branches: 80,
        statements: 90,
      },
    },
  },
});
