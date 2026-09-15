import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/coach-jm/",
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon.svg"],
      workbox: {
        /* Les vignettes d'exercices sont précachées ; les photos de fiche restent en ligne. */
        globPatterns: [
          "**/*.{js,css,html,ico,png,svg}",
          "**/*-thumb.*.webp",
        ],
      },
      manifest: {
        name: "Coach JM",
        short_name: "Coach JM",
        description: "Suivi sportif personnel",
        theme_color: "#f7f8fa",
        background_color: "#f7f8fa",
        display: "standalone",
        orientation: "portrait",
        start_url: "/coach-jm/",
        scope: "/coach-jm/",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
    }),
  ],
});

