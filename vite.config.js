import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import qrCode from '@eventengineering/vite-qr-code';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [qrCode({ addressFamilies: ['IPv4'] })],
  root: 'src',
  base: '/brewlingo/',
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html'),
        language: resolve(__dirname, 'src/language.html'),
        recipe: resolve(__dirname, 'src/recipe.html'),
        'debug-bean': resolve(__dirname, 'src/debug-bean.html'),
      },
    },
  },
  resolve: {
    alias: {
      'three/addons/': 'three/examples/jsm/',
    },
  },
  server: {
    host: true,
  },
});
