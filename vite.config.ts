import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    // CRXJS reads manifest.json and handles all extension entry points —
    // content scripts, service worker, popup, and web-accessible pages.
    crx({ manifest }),
  ],
  build: {
    rollupOptions: {
      // Explicitly declare gallery.html as an entry so Vite bundles its
      // index.tsx and rewrites the script src — CRXJS only does this
      // automatically for manifest-declared pages (popup, options, etc.),
      // not for web_accessible_resources HTML files.
      input: {
        gallery: path.resolve(__dirname, "src/gallery/gallery.html"),
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  // Keep the dev server port stable so HMR works consistently
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
    },
  },
});
