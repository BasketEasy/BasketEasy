import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Bind all interfaces, not just localhost. Harmless locally, required
    // in Docker: the dev container's process needs to accept connections
    // arriving through the port mapping, not just from inside the
    // container's own loopback.
    host: true,
    proxy: {
      // In dev, forward same-origin /api/* calls to the NestJS API so the
      // frontend code never needs to know the API's host/port.
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.ts'],
  },
});
