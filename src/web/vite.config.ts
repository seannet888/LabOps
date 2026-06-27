import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "src/web",
  plugins: [react()],
  server: {
    proxy: {
      "/api/v1": "http://127.0.0.1:3000"
    }
  },
  build: {
    outDir: "../../dist/web",
    emptyOutDir: true
  }
});
