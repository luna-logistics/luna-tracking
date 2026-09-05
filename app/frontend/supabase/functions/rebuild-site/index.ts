// Supabase Edge Function: trigger the GitHub Actions deploy workflow.
//
// The frontend's "Reconstruire le site" button hits this endpoint; the
// function checks the caller is an admin, then POSTs to GitHub's
// workflow_dispatch API using a fine-grained PAT stored as a secret
// (never exposed to the browser).
//
// Setup (in Supabase → Edge Functions → Manage secrets):
//   GITHUB_REBUILD_TOKEN  = a fine-grained PAT with "Actions: Read and
//                            write" on the repo (Contents: Read is also
//                            needed for the workflow to run).
//   GITHUB_OWNER          = luna-logistics   (default if unset)
//   GITHUB_REPO           = luna-tracking    (default if unset)
//   GITHUB_WORKFLOW       = deploy.yml       (default if unset)
//   GITHUB_REF            = main             (default if unset)

// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

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

  const token    = Deno.env.get('GITHUB_REBUILD_TOKEN');
  const owner    = Deno.env.get('GITHUB_OWNER')    ?? 'luna-logistics';
  const repo     = Deno.env.get('GITHUB_REPO')     ?? 'luna-tracking';
  const workflow = Deno.env.get('GITHUB_WORKFLOW') ?? 'deploy.yml';
  const ref      = Deno.env.get('GITHUB_REF')      ?? 'main';
  if (!token) return json({ error: 'server_misconfigured', detail: 'GITHUB_REBUILD_TOKEN not set' }, 500);

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'luna-tracking-rebuild',
      },
      body: JSON.stringify({ ref }),
    }
  );

  if (res.status === 204) return json({ ok: true, dispatched_at: new Date().toISOString() });
  const text = await res.text();
  return json({ error: 'github_error', status: res.status, detail: text.slice(0, 500) }, 502);
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
