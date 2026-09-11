import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.join(import.meta.dirname, 'src'),
      '@shared': path.join(import.meta.dirname, 'shared'),
    },
  },
  test: {
    root: import.meta.dirname,
    include: ['test/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    passWithNoTests: false,
    testTimeout: 1000 * 29,
  },
})
