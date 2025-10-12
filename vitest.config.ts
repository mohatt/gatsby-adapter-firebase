import { defineConfig, defaultExclude } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    exclude: [...defaultExclude, 'dist/**', '**/__fixtures__'],
    setupFiles: ['./test/setup-test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
    },
    chaiConfig: {
      truncateThreshold: 500,
    },
  },
})
