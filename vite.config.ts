import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
// App builds to dist/app/ for file isolation
// Assets are served from /app/assets/, but app routes work from root via middleware
export default defineConfig({
  base: '/app/', // Assets are served from /app/assets/, but app routes work from root via middleware
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    host: '0.0.0.0',
    port: 5000,
    strictPort: true,
  },
  build: {
    outDir: 'dist/app', // Build app to dist/app/ for file isolation
    emptyOutDir: true, // Clean only app directory
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
      },
    },
  },
});
