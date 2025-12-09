import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  base: '/brewlingo/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        language: resolve(__dirname, 'language.html'),
        recipe: resolve(__dirname, 'recipe.html'),
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
