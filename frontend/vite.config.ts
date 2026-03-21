import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      // ITAMIN CHECK plugin (FastAPI :3002)
      '/api/check': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
      // ITAMIN CORE (Express :3001)
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
