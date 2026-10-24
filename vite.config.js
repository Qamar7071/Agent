import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, every request to /api is forwarded to your existing AI backend.
// Set VITE_BACKEND_URL in .env (default: a Flask server on port 5000).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backend = env.VITE_BACKEND_URL || 'http://localhost:5000';
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': { target: backend, changeOrigin: true },
      },
    },
  };
});
