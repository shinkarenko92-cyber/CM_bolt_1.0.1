import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
// App builds to dist/ for app.roomi.pro deployment
export default defineConfig({
  base: '/', // App serves from root on app.roomi.pro
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
    // Build to dist/ root - simple structure for Vercel
    outDir: path.resolve(process.cwd(), 'dist'),
    emptyOutDir: true, // Clean dist before build
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
      },
    },
  },
});
