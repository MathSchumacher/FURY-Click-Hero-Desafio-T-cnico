import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  /* Ignore generated output + config files (not part of src) */
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'vitest.config.ts',
      'eslint.config.mjs',
      /* admin scripts são one-off; tsconfig src/* não os inclui */
      'scripts/**',
    ],
  },

  /* Base recommended */
  js.configs.recommended,

  /* Strict + stylistic TS rules with type information */
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  /* Type-aware parser setup */
  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      /* observability is part of the contract */
      'no-console': 'off',

      /* Async handlers/listeners legitimately return void */
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { arguments: false, attributes: false } },
      ],

      /* type aliases are fine — project convention */
      '@typescript-eslint/consistent-type-definitions': 'off',

      /* numbers/booleans/null in template literals is fine — too noisy otherwise */
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true, allowNullish: true, allowAny: false },
      ],

      /* keep flexibility for fixtures + small casts */
      '@typescript-eslint/consistent-type-assertions': [
        'warn',
        { assertionStyle: 'as', objectLiteralTypeAssertions: 'allow-as-parameter' },
      ],

      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  /* Loosen for tests — fixtures use generous casts/awaits */
  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/use-unknown-in-catch-callback-variable': 'off',
      '@typescript-eslint/consistent-generic-constructors': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
    },
  },

  /* Prettier last — disables conflicting stylistic rules */
  prettier,
);
