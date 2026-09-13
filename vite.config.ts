import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  build: {
    // Split heavy, rarely-changing vendors into their own cacheable chunks.
    // Client build only: the SSR bundle (scripts/prerender.mjs) leaves
    // node_modules external, and Rollup refuses to chunk an external.
    rollupOptions: isSsrBuild
      ? {}
      : {
          output: {
            manualChunks: {
              react: ['react', 'react-dom', 'react-router-dom'],
              motion: ['motion'],
            },
          },
        },
  },
  server: {
    // HMR can be disabled via DISABLE_HMR=true (e.g. hosted preview environments).
    hmr: process.env.DISABLE_HMR !== 'true',
  },
}));
