import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

// Prerendering is deliberately DISABLED in this initial scaffold — see the
// handoff report's "known follow-up chantiers" section. Until it lands,
// crawlers see the SPA shell on every URL and the per-page SEO tags arrive
// only after JS hydration. Non-critical for a soft launch, must be built
// before we care about search rankings.

export default defineConfig(() => ({
  plugins: [react()],
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
