import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * The dev server proxies `/api` to the Go service so that development and the
 * composed stack (nginx reverse proxy, see docs/DESIGN.md D14) behave identically
 * and `VITE_API_BASE_URL` can default to a same-origin `/api`.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      // `text` is the report scripts/coverage.sh captures, and its `skipFull` has to
      // be set per reporter: the top-level option never reaches it, and the default
      // hides every fully covered file — at 100% that is an empty table.
      reporter: [['text', { skipFull: false }], 'text-summary', 'json-summary', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/vite-env.d.ts', 'src/test/**'],
      // The suite covers 100% of `src`; the margin is there for rounding, not for
      // a regression budget.
      thresholds: {
        statements: 98,
        branches: 98,
        functions: 98,
        lines: 98,
      },
    },
  },
});
