import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
// Landing builds to dist/ for separate Vercel project (root directory: /landing)
export default defineConfig(({ mode }) => ({
  base: "/", // Landing serves from root on roomi.pro (separate Vercel project)
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // For separate Vercel project with root directory = /landing
    // Build to dist/ (relative to landing/ directory)
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true, // Clean dist before build
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
      },
    },
  },
}));
