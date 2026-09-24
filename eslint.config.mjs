// Lint config for packages/shared and pipeline. apps/mobile uses its own (eslint-config-expo).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', 'apps/**', 'pipeline/out/**', '**/dist/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
