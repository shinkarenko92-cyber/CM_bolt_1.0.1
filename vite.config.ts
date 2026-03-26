import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// https://vitejs.dev/config/
// App builds to dist/ for app.roomi.pro deployment
export default defineConfig({
  base: '/', // App serves from root on app.roomi.pro
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['favicon-v2.png', 'icon-192x192-v2.png', 'icon-512x512-v2.png', 'offline.html'],
      manifest: {
        name: 'Roomi Pro — Управление бронированиями',
        short_name: 'Roomi',
        description: 'Система управления бронированиями и синхронизации с Avito',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        categories: ['business', 'productivity', 'travel'],
        shortcuts: [
          {
            name: 'Календарь',
            short_name: 'Календарь',
            description: 'Открыть календарь бронирований',
            url: '/?view=calendar',
            icons: [{ src: '/icon-192x192.png', sizes: '192x192' }]
          },
          {
            name: 'Сообщения',
            short_name: 'Чаты',
            description: 'Открыть сообщения Avito',
            url: '/?view=messages',
            icons: [{ src: '/icon-192x192.png', sizes: '192x192' }]
          }
        ],
        screenshots: [
          {
            src: '/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            form_factor: 'wide',
            label: 'Roomi Dashboard'
          },
          {
            src: '/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Roomi Mobile'
          }
        ],
        icons: [
          { src: '/icon-192x192-v2.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512x512-v2.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512x512-v2.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@components': path.resolve(__dirname, 'src/components'),
    },
  },
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
