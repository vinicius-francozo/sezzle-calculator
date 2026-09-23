import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

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
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      reporter: [['text', { skipFull: false }], 'text-summary', 'json-summary', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/vite-env.d.ts', 'src/test/**'],
      thresholds: {
        statements: 98,
        branches: 98,
        functions: 98,
        lines: 98,
      },
    },
  },
});
