// Supabase Edge Function: proxy to DeepL.
//
// The DEEPL_API_KEY is set as an Edge Functions secret and NEVER leaves
// the server — the frontend just POSTs { text, sourceLang, targetLang }
// and gets back { translation }. That keeps our DeepL quota safe from
// browser-side abuse.
//
// Set the secret once:
//   supabase secrets set DEEPL_API_KEY=… --project-ref <ref>
//
// Deploy:
//   supabase functions deploy translate --project-ref <ref>
//
// The function is invoked from the browser via
// `supabase.functions.invoke('translate', { body: {...} })` — Supabase
// automatically attaches the caller's JWT so we can gate access to
// admins via public.is_admin().

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type TranslateRequest = {
  text: string | string[];
  targetLang: string;
  sourceLang?: string;
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // Admin gate — DeepL is a paid quota, only signed-in admins may call it.
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'unauthorized' }, 401);
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'unauthorized' }, 401);
  const { data: isAdmin } = await supabase.rpc('is_admin', { uid: user.id });
  if (!isAdmin) return json({ error: 'forbidden' }, 403);

  const apiKey = Deno.env.get('DEEPL_API_KEY');
  if (!apiKey) return json({ error: 'server_misconfigured', detail: 'DEEPL_API_KEY not set' }, 500);

  let body: TranslateRequest;
  try { body = await req.json(); }
  catch { return json({ error: 'invalid_json' }, 400); }

  const { text, targetLang, sourceLang } = body;
  if (!text || !targetLang) return json({ error: 'missing_fields', detail: 'text + targetLang required' }, 400);

  // DeepL Free = api-free.deepl.com. Pro = api.deepl.com. Auto-select by
  // looking at the API key suffix (Free keys end with ':fx').
  const host = apiKey.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';

  const form = new URLSearchParams();
  const textsArr = Array.isArray(text) ? text : [text];
  for (const t of textsArr) form.append('text', t);
  form.append('target_lang', targetLang.toUpperCase());
  if (sourceLang) form.append('source_lang', sourceLang.toUpperCase());
  // Keep HTML tags intact — safe for content that may contain markup.
  form.append('tag_handling', 'html');
  form.append('preserve_formatting', '1');

  const res = await fetch(`${host}/v2/translate`, {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  });

  if (!res.ok) {
    const err = await res.text();
    return json({ error: 'deepl_error', status: res.status, detail: err.slice(0, 500) }, 502);
  }

  const data = await res.json() as { translations: Array<{ text: string; detected_source_language: string }> };
  const translations = data.translations.map((t) => t.text);

  return json({
    translations,
    translation: translations[0],  // convenience for single-string calls
  });
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
