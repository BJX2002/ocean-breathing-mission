import { defineConfig } from 'vite';

// No external CDN dependencies: Phaser is bundled from node_modules.
export default defineConfig({
  base: './',
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2020',
  },
});
