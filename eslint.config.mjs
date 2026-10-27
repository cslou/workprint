import js from '@eslint/js';
import ts from 'typescript-eslint';

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.mastra/**', '**/.test-build/**', 'outputs/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  { languageOptions: { globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly' } } },
  { files: ['**/*.cjs'], languageOptions: { sourceType: 'commonjs' } },
];
