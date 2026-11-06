/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Chaque adresse du site est un vrai fichier HTML : GitHub Pages répond partout sans redirection.
const pages = [
  'index',
  'recherche/index',
  'annonce/index',
  'comparer/index',
  'favoris/index',
  'messages/index',
  'publier/index',
  'compte/index',
  'aide/index',
  'confidentialite/index',
  'mentions-legales/index',
  'conditions/index',
  '404',
];

/** Nom de l'éditeur pour les mentions légales, donné par Romain le 5 novembre 2026. */
const EDITOR_NAME = process.env.NIDALO_EDITEUR ?? 'Romain Badel';

const SUPABASE = 'https://izzsoitqtzzswkpvdozd.supabase.co';

/** Règles de sécurité du navigateur : seuls les serveurs listés peuvent être contactés. */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  `img-src 'self' data: blob: ${SUPABASE} https://data.geopf.fr`,
  "font-src 'self'",
  `connect-src 'self' ${SUPABASE} ${SUPABASE.replace('https:', 'wss:')} https://tiles.openfreemap.org https://data.geopf.fr https://geo.api.gouv.fr`,
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const COMMON_HEAD = [
  '<meta name="theme-color" content="#1F5BC6">',
  '<meta name="format-detection" content="telephone=no">',
  '<meta name="referrer" content="same-origin">',
  '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
  '<meta property="og:site_name" content="Nidalo">',
  '<meta property="og:locale" content="fr_FR">',
  '<meta property="og:type" content="website">',
  '<meta property="og:image" content="https://nidalo.fr/assets/og-image.png">',
  '<meta property="og:image:width" content="1200">',
  '<meta property="og:image:height" content="630">',
  '<meta name="twitter:card" content="summary_large_image">',
].join('\n');

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** En-tête commun de toutes les pages, et règles de sécurité dans le site construit (pas en développement). */
function nidaloHtml(): Plugin {
  let isBuild = false;
  return {
    name: 'nidalo-html',
    configResolved(config) {
      isBuild = config.command === 'build';
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const csp = isBuild ? `<meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}">` : '';
        let out = html.replace('<!-- nidalo:csp -->', csp).replace('<!-- nidalo:head -->', COMMON_HEAD);
        if (EDITOR_NAME) out = out.replaceAll('{{EDITEUR}}', escapeHtml(EDITOR_NAME));
        return out;
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), nidaloHtml()],
  base: '/',
  build: {
    outDir: 'docs',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: Object.fromEntries(pages.map((p) => [p, resolve(import.meta.dirname, `${p}.html`)])),
      output: {
        // Le moteur de la carte (fichier .mjs) est servi en .js, type que tous les hébergeurs connaissent.
        assetFileNames: (info) =>
          (info.names?.[0] ?? '').endsWith('.mjs') ? 'assets/[name]-[hash].js' : 'assets/[name]-[hash][extname]',
      },
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
