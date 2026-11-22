import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  resolve: {
    preserveSymlinks: true
  },
  plugins: [
    react()
  ],
  build: {
    target: 'es2018'
  },
  server: {
    port: 5173,
    host: true, // Allow access from local network for mobile phone testing
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true
      }
    }
  }
});
