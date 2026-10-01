import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The API server (npm run server) listens on 8787. In development the
// frontend proxies /api to it; if the server is not running the frontend
// falls back to the bundled, clearly-labelled demo dataset.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": { target: "http://localhost:8787", changeOrigin: true },
    },
  },
});
