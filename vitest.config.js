import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testingNodeModules = path.resolve(__dirname, './node_modules');

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './setup.js',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/e2e/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.config.js',
        '**/mocks/**',
      ],
    },
    server: {
      deps: {
        inline: [
          'react',
          'react-dom',
          '@testing-library/react',
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
        ],
      },
    },
  },
  resolve: {
    dedupe: ['react', 'react-dom', 'axios'],
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      // Keep the renderer and imported frontend components on one React instance.
      { find: /^react$/, replacement: path.resolve(testingNodeModules, 'react/index.js') },
      { find: /^react\/jsx-runtime$/, replacement: path.resolve(testingNodeModules, 'react/jsx-runtime.js') },
      { find: /^react\/jsx-dev-runtime$/, replacement: path.resolve(testingNodeModules, 'react/jsx-dev-runtime.js') },
      { find: /^react-dom$/, replacement: path.resolve(testingNodeModules, 'react-dom/index.js') },
      { find: /^react-dom\/client$/, replacement: path.resolve(testingNodeModules, 'react-dom/client.js') },
      { find: /^react-dom\/test-utils$/, replacement: path.resolve(testingNodeModules, 'react-dom/test-utils.js') },
      { find: /^axios$/, replacement: path.resolve(testingNodeModules, 'axios/index.js') },
      { find: /^framer-motion$/, replacement: path.resolve(__dirname, './mocks/framer-motion.js') },
      { find: /^firebase\/auth$/, replacement: path.resolve(__dirname, './mocks/firebase-auth.js') },
      { find: /.*firebase\/firebaseApp$/, replacement: path.resolve(__dirname, './mocks/firebase-app.js') },
      { find: /.*firebase\\firebaseApp$/, replacement: path.resolve(__dirname, './mocks/firebase-app.js') },
    ],
  },
  ssr: {
    noExternal: [
      'firebase',
      '@firebase/auth',
      '@firebase/firestore',
      '@firebase/app',
      '@firebase/util',
      '@firebase/component',
    ],
  },
});
