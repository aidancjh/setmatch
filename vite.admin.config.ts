import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Separate build for the admin app — deliberately NO VitePWA plugin (the
// admin dashboard has no offline/installable use case) and a distinct
// outDir so it never collides with the consumer app's dist/.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist-admin",
    rollupOptions: {
      input: "admin.html",
    },
  },
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: "http://localhost:4100",
        changeOrigin: true,
      },
    },
  },
});
