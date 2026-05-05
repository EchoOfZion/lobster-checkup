import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      '.next/**',
      'dist/**',
      'node_modules/**',
      'src/app/**',
      'src/components/**',
      'next.config.ts',
      'postcss.config.mjs',
    ],
  },
)
