import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.js',
    // Kizárjuk az e2e teszteket (azok Playwright-hez valók)
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/e2e/**', // E2E tesztek kizárása
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.config.js',
        '**/mocks/**'
      ]
    }
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  }
});