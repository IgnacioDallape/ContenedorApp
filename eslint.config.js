import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

/**
 * ESLint flat config (ESLint 9).
 *
 * Postura pragmática para una base existente y grande (~23k LOC sin lint previo):
 * los problemas de estilo/legacy son `warn` (no rompen CI), y sólo dejamos como
 * `error` lo que indica un bug real (hooks mal usados, redeclaraciones, undef).
 *
 * Los motores (`packing.js`, `palletPacking.js`, `pb_*` en `palletStore.js`) se
 * lintean pero NO se editan todavía — por eso casi todo es warning por ahora.
 */
export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'supabase/functions/**', // Deno + TypeScript, toolchain aparte
      'arquitectura.html',
      'public/sw.js', // service worker: globals propios (self, caches)
      '**/*.min.js',
    ],
  },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2021 },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-constant-condition': ['warn', { checkLoops: false }],
      'no-prototype-builtins': 'warn',
      'no-cond-assign': 'warn',
      'no-control-regex': 'warn',
      'no-useless-escape': 'warn',
      'no-irregular-whitespace': 'warn',
      'no-fallthrough': 'warn',
      'no-redeclare': 'warn',
      'no-unreachable': 'warn',
      'no-undef': 'error',
      'no-const-assign': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['api/**/*.js', 'vite.config.js', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['**/*.test.{js,jsx}', 'src/__tests__/**/*.{js,jsx}'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        vi: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
      },
    },
  },
];
