import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    middlewareMode: false,
    proxy: {
      "/api": {
        target: process.env.API_URL || "http://backend:8000",
        changeOrigin: true,
      },
    },
  },
});
