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
    // process.cwd() всегда указывает на корень проекта (где запущен npm run build)
    // Это гарантирует правильный путь независимо от структуры папок
    outDir: path.resolve(process.cwd(), 'dist/app'),
    emptyOutDir: false, // Don't clean dist, preserve landing build
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
      },
    },
  },
});
