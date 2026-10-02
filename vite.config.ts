import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
// Server-side only: keeps the Gemini key out of the client bundle.
import { askMySchoolApi } from './server/vitePlugin.mjs';

export default defineConfig({
  plugins: [react(), askMySchoolApi()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5180,
    strictPort: false,
  },
  build: {
    rollupOptions: {
      output: {
        // Keep the slow-moving libraries in their own cacheable chunk.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          motion: ['framer-motion'],
        },
      },
    },
  },
});
