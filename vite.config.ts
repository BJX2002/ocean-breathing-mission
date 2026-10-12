import { cpSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const PROJECT_ROOT = fileURLToPath(new URL('.', import.meta.url));
const OPENING_VIDEOS = [
  'OP1_Cantonese.web.mp4',
  'OP1_English.web.mp4',
  'OP1_Mandarian.web.mp4',
  'OP2_Cantonese.web.mp4',
  'OP2_English.web.mp4',
  'OP2_Mandarian.web.mp4',
] as const;

/** Copy only browser-ready runtime media instead of the 475 MB source archive. */
function copyRuntimeMedia(): Plugin {
  let outputDirectory = resolve(PROJECT_ROOT, 'dist');
  return {
    name: 'copy-runtime-media',
    apply: 'build',
    configResolved(config) {
      outputDirectory = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const outputAssets = resolve(outputDirectory, 'assets');
      mkdirSync(outputAssets, { recursive: true });
      const outputVideos = resolve(outputAssets, 'chapter1/OP_NEW');
      mkdirSync(outputVideos, { recursive: true });
      for (const file of OPENING_VIDEOS) {
        cpSync(
          resolve(PROJECT_ROOT, 'public/assets/chapter1/OP_NEW', file),
          resolve(outputVideos, file),
        );
      }
    },
  };
}

// No external CDN dependencies: Phaser is bundled from node_modules.
export default defineConfig({
  base: './',
  publicDir: 'public/runtime-public',
  plugins: [copyRuntimeMedia()],
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
