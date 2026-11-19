import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 6969, strictPort: true },
  preview: { port: 6969, strictPort: true },
  css: {
    preprocessorOptions: {
      // Bootstrap 5.3 masih memakai @import / fungsi Sass lama; peringatannya dibisukan sampai Bootstrap 6.
      scss: { silenceDeprecations: ['import', 'global-builtin', 'color-functions', 'mixed-decls', 'if-function'] },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});