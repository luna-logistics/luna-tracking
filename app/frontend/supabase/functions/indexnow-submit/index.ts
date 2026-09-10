// indexnow-submit — batch IndexNow notifier for Luna Tracking.
// Reads the `indexnow_state` watermark, collects every public entity
// whose seo_changed_at moved past it, builds crawlable URLs matching
// the prerender's language fan-out, POSTs one bulk request to
// api.indexnow.org, and advances the watermark on 200/202. On failure
// the watermark stays put so the next run retries the same delta.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const HOST = 'https://lunatrackinglogistics.com';
const KEY = '7c5abad259dd4708bdfae721ce54bb1a';
const KEY_LOCATION = `${HOST}/${KEY}.txt`;

const restHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

async function rest<T = Record<string, unknown>>(path: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: restHeaders });
  if (!res.ok) throw new Error(`REST ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const has = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

Deno.serve(async () => {
  try {
    const nowTs = new Date().toISOString();
    const stateRows = await rest<{ last_run_at: string }>('indexnow_state?select=last_run_at&id=eq.true');
    const lastRun = stateRows[0]?.last_run_at ?? '1970-01-01T00:00:00Z';
    const since = `seo_changed_at=gt.${encodeURIComponent(lastRun)}`;

    const [products, blogs, pages] = await Promise.all([
      rest<{ slug: string | null; slug_fr: string | null; slug_en: string | null }>(
        `products?select=slug,slug_fr,slug_en&is_active=eq.true&${since}`),
      rest<{ slug: string | null; slug_fr: string | null; slug_en: string | null }>(
        `blog_posts?select=slug,slug_fr,slug_en&published=eq.true&${since}`),
      rest<{ slug_fr: string | null; slug_en: string | null }>(
        `custom_pages?select=slug_fr,slug_en&published=eq.true&${since}`),
    ]);

    const urls = new Set<string>();

    for (const p of products) {
      const fr = has(p.slug_fr) ? p.slug_fr : (has(p.slug) ? p.slug : null);
      const en = has(p.slug_en) ? p.slug_en : (has(p.slug) ? p.slug : null);
      if (fr) urls.add(`${HOST}/achat-envoi/${fr}`);
      if (en) urls.add(`${HOST}/en/shop-and-ship/${en}`);
    }
    for (const b of blogs) {
      const fr = has(b.slug_fr) ? b.slug_fr : (has(b.slug) ? b.slug : null);
      const en = has(b.slug_en) ? b.slug_en : null;
      if (fr) urls.add(`${HOST}/blog/${fr}`);
      if (en) urls.add(`${HOST}/en/blog/${en}`);
    }
    for (const c of pages) {
      if (has(c.slug_fr)) urls.add(`${HOST}/${c.slug_fr}`);
      if (has(c.slug_en)) urls.add(`${HOST}/en/${c.slug_en}`);
    }

    const urlList = [...urls];

    let indexnowStatus: number | null = null;
    if (urlList.length > 0) {
      const res = await fetch('https://api.indexnow.org/IndexNow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          host: 'lunatrackinglogistics.com',
          key: KEY,
          keyLocation: KEY_LOCATION,
          urlList,
        }),
      });
      indexnowStatus = res.status;
      if (res.status !== 200 && res.status !== 202) {
        return json({ ok: false, indexnowStatus, submitted: urlList.length, body: await res.text() }, 502);
      }
    }

    // Advance the watermark even if urlList was empty — a no-op tick
    // still counts, so subsequent seo_changed_at bumps don't drag along
    // pre-existing rows.
    await fetch(`${SUPABASE_URL}/rest/v1/indexnow_state?id=eq.true`, {
      method: 'PATCH',
      headers: { ...restHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ last_run_at: nowTs }),
    });

    return json({ ok: true, indexnowStatus, submitted: urlList.length, urls: urlList });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
});
