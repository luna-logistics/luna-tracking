import { createRoot } from 'react-dom/client';
import App from './App';
import { bootI18n } from './i18n';
import './index.css';
import { allIndexableUrls } from '@/lib/url/routes';

// Recover from stale-SPA-client failures: an old tab clicking a lazy chunk that
// no longer exists on the server (new deployment landed) auto-reloads once so
// the tab gets the fresh index.html + fresh chunk hashes. One-shot sessionStorage
// flag prevents infinite loops if the new build itself has a broken chunk.
window.addEventListener('vite:preloadError', (event) => {
  const already = sessionStorage.getItem('vite_preload_reloaded');
  if (already) return;
  event.preventDefault();
  sessionStorage.setItem('vite_preload_reloaded', '1');
  window.location.reload();
});

// Cloudflare Pages' `/* -> /index.html 200` fallback serves the home's
// prerendered HTML on any non-prerendered URL. That HTML carries the home's
// canonical, description, og:*, twitter:*, hreflang — none of them `data-rh`
// tagged, so react-helmet-async can't identify them and appends its own
// alongside. Result: two canonicals per page, wrong-URL indexing.
// Strip those tags before mount so Helmet writes fresh from the visited page.
const PRERENDERED = new Set(allIndexableUrls());

function stripFallbackSeoTags(): void {
  document.head.querySelectorAll(
    'link[rel="canonical"], meta[name="description"], meta[property^="og:"], meta[name^="twitter:"], link[rel="alternate"][hreflang]'
  ).forEach((el) => el.remove());
  document.title = 'Chargement…';
}

function isPrerenderedUrl(pathname: string): boolean {
  const normalized = pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
  return PRERENDERED.has(normalized);
}

if (!isPrerenderedUrl(window.location.pathname)) {
  stripFallbackSeoTags();
}

// Boot i18n before mount. For FR visitors this resolves synchronously
// on the next microtask; for `/en/*` visitors we wait for the ~30-80 ms
// dynamic EN bundle download so React never renders the FR fallback
// where the prerendered HTML already shows EN content.
bootI18n().finally(() => {
  createRoot(document.getElementById('root')!).render(<App />);
});
