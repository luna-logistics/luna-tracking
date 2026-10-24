// Supabase Edge Function: find the description of products already on Luna.
//
// POST { ids: string[] } (10 at most) with an admin's JWT. For each product
// the function reads the store page it was imported from
// (product_sources.source_url), extracts the description (JSON-LD, microdata,
// meta — see _shared/product-description.ts) and returns it with the page's
// language. It writes NOTHING: the admin page saves the text, translates it
// with DeepL when needed, and only into empty fields.
//
// Fetches identify as Luna's catalogue bot, like the scraper. A store that
// answers with a bot wall (403/429/captcha) is reported as "blocked", never
// bypassed.
//
// Deploy:
//   supabase functions deploy product-description --project-ref <ref>

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractDescription, looksBlocked } from '../_shared/product-description.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const USER_AGENT = 'LunaTrackingBot/1.0 (+https://lunatrackinglogistics.com; catalogue import)';
const MAX_IDS = 10;
const TIMEOUT_MS = 12000;
const MAX_BYTES = 3_000_000;

type Result = {
  id: string;
  status: 'found' | 'no_source' | 'not_found' | 'blocked' | 'error';
  description?: string;
  lang?: string | null;
  url?: string;
  detail?: string;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'unauthorized' }, 401);
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'unauthorized' }, 401);
  const { data: isAdmin } = await supabase.rpc('is_admin', { uid: user.id });
  if (!isAdmin) return json({ error: 'forbidden' }, 403);

  let ids: string[];
  try {
    const body = await req.json();
    ids = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === 'string').slice(0, MAX_IDS) : [];
  } catch { return json({ error: 'invalid_json' }, 400); }
  if (!ids.length) return json({ error: 'missing_fields', detail: 'ids required' }, 400);

  // RLS: admins read products and product_sources.
  const [{ data: products }, { data: sources }] = await Promise.all([
    supabase.from('products').select('id, name_fr').in('id', ids),
    supabase.from('product_sources').select('product_id, source_url').in('product_id', ids),
  ]);
  const nameById = new Map((products ?? []).map((p: any) => [p.id, p.name_fr as string]));
  const urlById = new Map((sources ?? []).filter((s: any) => s.source_url).map((s: any) => [s.product_id, s.source_url as string]));

  const results: Result[] = [];
  // Three pages at a time: polite to the stores, fast enough for 10 products.
  for (let i = 0; i < ids.length; i += 3) {
    results.push(...await Promise.all(ids.slice(i, i + 3).map((id) => describe(id, urlById.get(id), nameById.get(id) ?? ''))));
  }
  return json({ results });
});

async function describe(id: string, url: string | undefined, name: string): Promise<Result> {
  if (!url || !/^https?:\/\//i.test(url)) return { id, status: 'no_source' };
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'fr-BE,fr;q=0.9,en;q=0.5' },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const html = (await res.text()).slice(0, MAX_BYTES);
    if ([401, 403, 405, 429, 503].includes(res.status)) return { id, status: 'blocked', url, detail: `HTTP ${res.status}` };
    if (!res.ok) return { id, status: 'error', url, detail: `HTTP ${res.status}` };
    const found = extractDescription(html, res.url || url, name);
    if (found) return { id, status: 'found', url, description: found.text, lang: found.lang };
    return { id, status: looksBlocked(res.status, html) ? 'blocked' : 'not_found', url };
  } catch (err) {
    return { id, status: 'error', url, detail: err instanceof Error ? err.message.slice(0, 200) : 'fetch failed' };
  }
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}
