// Lint rules for Dashi (0.4.1). Plain ES modules, no build step: the browser
// code under src/ and kit/, the Node server under server/, and the tests.
// The rules catch real mistakes (undefined names, unused code, unreachable
// branches), not style; formatting is left to the code's own conventions.
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['vendor/**', 'node_modules/**', 'data/**', 'data-clients/**', 'media/**', 'docs/**', 'shots/**', 'coverage/**'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2024, sourceType: 'module' },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      // An underscore marks a name kept on purpose (a destructured value dropped, an unused argument).
      'no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': ['error', { destructuring: 'all', ignoreReadBeforeAssign: true }],
    },
  },
  // The browser: the app, the design kit, and the page scripts that load vendored libraries as globals.
  {
    files: ['src/**/*.js', 'kit/**/*.js'],
    languageOptions: { globals: { ...globals.browser, maplibregl: 'readonly', d3: 'readonly', pdfjsLib: 'readonly', qrcode: 'readonly', toastui: 'readonly' } },
  },
  // The server, scripts and tests run on Node.
  {
    files: ['server/**/*.js', 'server.js', 'clients.js', 'test/**/*.js', 'eslint.config.js', 'scripts/**/*.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  // Tests also import browser modules, which may touch browser names behind checks.
  {
    files: ['test/**/*.js'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
];
