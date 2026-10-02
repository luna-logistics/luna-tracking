import { useEffect } from 'react';

/**
 * Writes one JSON-LD block straight to <head> by a stable id, updating it in
 * place — NOT through react-helmet-async.
 *
 * On this site Helmet never commits to <head> after the first render (it only
 * owns the prerendered `data-rh` tags), so a `<Helmet><script type="ld+json">`
 * is silently dropped ~100 ms after load — which is exactly why the prerendered
 * JSON-LD used to vanish on hydration. The prerender emits the same block with
 * the same id and NO `data-rh`, so Helmet leaves it alone; this component finds
 * that node and keeps it in sync with the live (DB-driven) data, so there is
 * always exactly one block and it never disappears. Same mechanism the
 * calculator's FAQ block (`calc-faq-jsonld`) has used since 2026-09.
 *
 * Removed on unmount so a client-side navigation never leaves a previous page's
 * structured data behind.
 */
export function JsonLd({ data, id = 'ld-page' }: { data: unknown; id?: string }) {
  const json = data ? JSON.stringify(data) : '';
  useEffect(() => {
    if (!json) return;
    let el = document.getElementById(id) as HTMLScriptElement | null;
    if (!el) {
      el = document.createElement('script');
      el.type = 'application/ld+json';
      el.id = id;
      document.head.appendChild(el);
    }
    el.textContent = json;
  }, [id, json]);
  useEffect(() => () => { document.getElementById(id)?.remove(); }, [id]);
  return null;
}
