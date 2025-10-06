import { defineConfig, defaultExclude } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: [...defaultExclude, 'dist/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
    },
  },
})
