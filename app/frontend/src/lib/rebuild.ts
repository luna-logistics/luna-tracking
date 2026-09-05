import { supabase } from '@/lib/supabase';

/**
 * Trigger a fresh deploy by POSTing to the deploy.yml workflow_dispatch
 * endpoint via a Supabase Edge Function (which holds the GitHub PAT).
 */
export async function triggerRebuild(): Promise<{ ok: true; dispatched_at: string }> {
  const { data, error } = await supabase.functions.invoke('rebuild-site', { body: {} });
  if (error) throw error;
  if (!data || !(data as any).ok) throw new Error('rebuild: unexpected response');
  return data as { ok: true; dispatched_at: string };
}

export type WorkflowRunSummary = {
  id: number;
  head_sha: string;
  head_commit_message: string | null;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out' | null;
  created_at: string;
  updated_at: string;
  html_url: string;
  actor: string | null;
};

/**
 * Public GitHub API — no auth needed for a public repo. Rate-limited to
 * 60 req/hr per IP unauthenticated; the admin poller uses that budget
 * (fine for one admin refreshing every few seconds).
 */
export async function fetchLatestWorkflowRun(): Promise<WorkflowRunSummary | null> {
  const res = await fetch(
    'https://api.github.com/repos/luna-logistics/luna-tracking/actions/workflows/deploy.yml/runs?per_page=1',
    { headers: { Accept: 'application/vnd.github+json' } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const run = data?.workflow_runs?.[0];
  if (!run) return null;
  return {
    id: run.id,
    head_sha: run.head_sha,
    head_commit_message: run.head_commit?.message ?? null,
    status: run.status,
    conclusion: run.conclusion,
    created_at: run.created_at,
    updated_at: run.updated_at,
    html_url: run.html_url,
    actor: run.triggering_actor?.login ?? null,
  };
}
