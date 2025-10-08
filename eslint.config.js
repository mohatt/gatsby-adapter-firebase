import eslint from '@eslint/js'
import tsEslint from 'typescript-eslint'

export default tsEslint.config(
  eslint.configs.recommended,
  ...tsEslint.configs.recommended,
  ...tsEslint.configs.stylistic,
  {
    name: 'gatsby-adapter-firebase',
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
    },
  },
)
