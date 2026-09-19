import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { VitePWA } from "vite-plugin-pwa";

/**
 * Mode `lan` (npm run dev:lan) : serveur de recette exposé sur le réseau
 * local en HTTPS auto-signé, pour tester sur un iPhone réel depuis un
 * origin qui n'est pas celui de la PWA (Web Share et crypto.subtle
 * exigent un contexte sécurisé). Sans effet sur le build de production.
 */
export default defineConfig(({ mode }) => ({
  base: "/coach-jm/",
  define: {
    /* Horodatage de build, affiché dans Plus pour savoir quelle version tourne. */
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  ...(mode === "lan" ? { server: { host: true, port: 5175, strictPort: true } } : {}),
  plugins: [
    react(),
    ...(mode === "lan" ? [basicSsl()] : []),
    VitePWA({
      /* Pas encore d'interface de mise à jour : la nouvelle version s'active au lancement suivant. */
      registerType: "autoUpdate",
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
}));
