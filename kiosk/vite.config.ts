import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      scope: "/kiosk/",
      base: "/kiosk/",
      includeAssets: ["pwa-192.png", "pwa-512.png"],
      manifest: {
        name: "Boissons - Kiosk",
        short_name: "Boissons",
        start_url: "/kiosk/",
        scope: "/kiosk/",
        display: "standalone",
        background_color: "#0b1220",
        theme_color: "#0b1220",
        icons: [
          { src: "/kiosk/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/kiosk/pwa-512.png", sizes: "512x512", type: "image/png" }
        ]
      }
    })
  ],
  base: "/kiosk/",
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
