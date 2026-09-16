import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

const alias = { '@': resolve(__dirname, '.') }

// Building a jsdom window is the most expensive thing this suite does: measured
// at 117.73s of worker time for the 55 logic tests alone, against 11ms under the
// node environment, and the memory that costs is what made forks die mid-run and
// take ten test files with them while vitest still exited 0.
//
// So a DOM is given only to the tests that use one: every component test, plus
// the two logic tests that read localStorage. A new *.test.ts that touches
// `window` or `document` belongs in this list; without it the failure says the
// global is undefined.
const NEEDS_DOM = [
  'test/**/*.test.tsx',
  'test/dictionary-recent.test.ts',
  'test/wordlist-filters.test.ts',
]

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'dom',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./test/setup.ts'],
          include: NEEDS_DOM,
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'logic',
          environment: 'node',
          globals: true,
          include: ['test/**/*.test.ts'],
          exclude: ['**/node_modules/**', ...NEEDS_DOM.filter((p) => p.endsWith('.ts'))],
        },
      },
    ],
  },
})
