import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import fs from 'fs';
import type { Plugin } from 'vite';

// Preload the Poppins faces that paint above the fold (body 400 + headings
// 700) so their fetch starts with the HTML instead of after the CSS parses —
// breaks the HTML → CSS → woff2 chain. 500/600 stay lazy (browser fetches
// them only when used). Filenames are hashed, so resolve from the bundle.
const PRELOAD_FONT_WEIGHTS = ['400', '700'];
function preloadCriticalFonts(): Plugin {
  return {
    name: 'luna:preload-critical-fonts',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const files = Object.keys(ctx.bundle ?? {});
        return PRELOAD_FONT_WEIGHTS.flatMap((w) => {
          const file = files.find((f) => new RegExp(`poppins-latin-${w}-normal-[^/]+\\.woff2$`).test(f));
          if (!file) throw new Error(`[preload-fonts] poppins latin ${w} woff2 not found in bundle`);
          return [{
            tag: 'link',
            attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `/${file}`, crossorigin: '' },
            injectTo: 'head-prepend' as const,
          }];
        });
      },
    },
  };
}

// ARD discovery: agents probe /.well-known/ai-catalog.json as well as the
// root file. Emit it from the single public/ai-catalog.json source so the two
// never drift (without it the Worker's SPA fallback answers with HTML).
function wellKnownAiCatalog(): Plugin {
  return {
    name: 'luna:well-known-ai-catalog',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: '.well-known/ai-catalog.json',
        source: fs.readFileSync(path.resolve(__dirname, 'public/ai-catalog.json'), 'utf8'),
      });
    },
  };
}

// Prerendering is deliberately DISABLED in this initial scaffold — see the
// handoff report's "known follow-up chantiers" section. Until it lands,
// crawlers see the SPA shell on every URL and the per-page SEO tags arrive
// only after JS hydration. Non-critical for a soft launch, must be built
// before we care about search rankings.

export default defineConfig(() => ({
  plugins: [react(), preloadCriticalFonts(), wellKnownAiCatalog()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: parseInt(process.env.VITE_PORT || '3000'),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'router-vendor': ['react-router-dom'],
          'supabase-vendor': ['@supabase/supabase-js'],
          'i18n-vendor': ['react-i18next', 'i18next'],
          'helmet-vendor': ['react-helmet-async'],
          'query-vendor': ['@tanstack/react-query'],
        },
      },
    },
    chunkSizeWarningLimit: 500,
  },
}));
