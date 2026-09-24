import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin, type ServerOptions } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { VitePWA } from "vite-plugin-pwa";

/**
 * Mode `lan` (npm run dev:lan) : serveur de recette exposé sur le réseau
 * local en HTTPS, pour tester sur un iPhone réel depuis un origin qui
 * n'est pas celui de la PWA (Web Share et crypto.subtle exigent un
 * contexte sécurisé). Sans effet sur le build de production.
 *
 * Certificat : `.certs/lan.crt` + `lan.key` produits par
 * `scripts/make-lan-cert.sh <IP>` (autorité locale + SAN sur l'adresse IP,
 * ce qu'iOS exige) ; à défaut, le certificat générique du plugin
 * basic-ssl, que Safari iOS refuse. L'autorité publique
 * `coach-jm-dev-ca.cer` est servie à `/coach-jm/dev-ca.cer` pour que
 * l'iPhone puisse la télécharger depuis ce même serveur.
 */
const CERT_DIR = resolve(__dirname, ".certs");
const lanCert = resolve(CERT_DIR, "lan.crt");
const lanKey = resolve(CERT_DIR, "lan.key");
const lanCa = resolve(CERT_DIR, "coach-jm-dev-ca.cer");
const hasLanCert = existsSync(lanCert) && existsSync(lanKey);

function lanServer(): ServerOptions {
  return {
    host: true,
    port: 5175,
    strictPort: true,
    ...(hasLanCert ? { https: { cert: readFileSync(lanCert), key: readFileSync(lanKey) } } : {}),
  };
}

function serveDevCa(): Plugin {
  return {
    name: "coach-jm-serve-dev-ca",
    configureServer(server) {
      server.middlewares.use("/coach-jm/dev-ca.cer", (_req, res) => {
        if (!existsSync(lanCa)) {
          res.statusCode = 404;
          res.end("Autorité absente : lancez scripts/make-lan-cert.sh");
          return;
        }
        res.setHeader("Content-Type", "application/x-x509-ca-cert");
        res.setHeader("Content-Disposition", 'attachment; filename="coach-jm-dev-ca.cer"');
        res.end(readFileSync(lanCa));
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  base: "/coach-jm/",
  define: {
    /* Horodatage de build, affiché dans Plus pour savoir quelle version tourne. */
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    /* Version de l'application (package.json), portée par les sauvegardes. */
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? "0.0.0"),
  },
  ...(mode === "lan" ? { server: lanServer() } : {}),
  /* Mode `tunnel` (npm run preview:tunnel) : le build de production servi en
     HTTP local, exposé par un tunnel Cloudflare éphémère (HTTPS public à
     URL aléatoire) pour la recette sur iPhone sans certificat à installer.
     Seul `dist/` est servi ; aucun fichier du dépôt ni clé privée. */
  ...(mode === "tunnel"
    ? {
        preview: { host: "127.0.0.1", port: 5176, strictPort: true, allowedHosts: [".trycloudflare.com"] },
        /* Recette C.8 : la page de test Dexie v3 n'entre que dans ce build,
           jamais dans celui de production. */
        build: { rollupOptions: { input: { main: resolve(__dirname, "index.html"), recette: resolve(__dirname, "recette-v3.html") } } },
      }
    : {}),
  plugins: [
    react(),
    ...(mode === "lan" ? [serveDevCa(), ...(hasLanCert ? [] : [basicSsl()])] : []),
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
