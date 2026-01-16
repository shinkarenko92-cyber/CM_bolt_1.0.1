import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
// Landing builds to dist/ for separate Vercel project (root directory: /landing)
// When Vercel runs build from /landing, process.cwd() = /landing
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
    // For separate Vercel project: root directory = /landing
    // Build to dist/ relative to landing/ directory
    // Result: landing/dist/index.html (Vercel looks for dist/index.html from /landing root)
    outDir: "dist",
    emptyOutDir: true, // Clean dist before build
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
      },
    },
  },
}));
