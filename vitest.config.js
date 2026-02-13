import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.js',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/e2e/**',
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
    },
    // ✅ KRITIKUS JAVÍTÁS: A Firebase modulokat inline kell kezelni,
    // hogy a vi.mock() mock-ok elfogják a hívásokat SSR módban is.
    // Az 'external' lista tiltja, hogy a Vite SSR-ként kezelje ezeket.
    server: {
      deps: {
        inline: [
          'react',
          'react-dom',
          '@testing-library/react',
          // Firebase - minden al-csomag inline kell
          'firebase',
          '@firebase/app',
          '@firebase/auth',
          '@firebase/firestore',
          '@firebase/util',
          '@firebase/component',
          '@firebase/logger',
          '@firebase/installations',
          '@firebase/messaging',
          '@firebase/analytics',
        ]
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // ✅ KRITIKUS: React aliasok - csak egy példány használata
      'react': path.resolve(__dirname, './node_modules/react'),
      'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
    }
  },
  // ✅ ÚJ: SSR konfiguráció - Firebase ne legyen external SSR modul
  ssr: {
    noExternal: [
      'firebase',
      '@firebase/auth',
      '@firebase/firestore',
      '@firebase/app',
      '@firebase/util',
      '@firebase/component',
    ]
  }
});