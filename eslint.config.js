import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
export default tseslint.config(
 {ignores:['apps/web/src/contracts.ts','apps/web/src/routeTree.gen.ts','apps/web/dist/**']},
 js.configs.recommended,
 ...tseslint.configs.recommended,
 {files:['apps/web/src/**/*.{ts,tsx}'],languageOptions:{globals:globals.browser},rules:{'@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_'}]}},
);
