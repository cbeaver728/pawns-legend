import { defineConfig } from 'vite';

// Relative base so the build works at https://<user>.github.io/pawns-legend/
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 900 },
});
