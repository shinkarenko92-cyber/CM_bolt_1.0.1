import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
// Landing builds to dist/landing/ and serves from root on roomi.pro
export default defineConfig(({ mode }) => ({
  base: "/landing/", // Assets are served from /landing/assets/, but page is served from root via rewrite
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
    outDir: path.resolve(__dirname, "../dist/landing"), // Build landing to dist/landing/ (absolute path to avoid nesting)
    emptyOutDir: true, // Clean only landing directory
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
      },
    },
  },
}));
