// Support-notify — sends the admin an email via Resend whenever a new
// client / guest message lands in support_messages. Invoked by the
// pg_net trigger set up in 20260910200000_support_notifications.sql.
// Idempotent enough for the trigger's retry model: Resend accepts the
// same request twice, and the DB caller only fires once per row.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_KEY   = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM_FALLBACK = 'Luna Support <support@lunatrackinglogistics.com>';
const SITE_URL     = Deno.env.get('SITE_URL') ?? 'https://lunatrackinglogistics.com';

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', ...cors },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
  ));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST')    return ok({ error: 'method_not_allowed' }, 405);

  // Bearer check: the trigger passes the service role key so an untrusted
  // caller can't spam admin emails through this endpoint.
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token || token !== SERVICE_KEY) return ok({ error: 'forbidden' }, 403);

  let payload: { message_id?: string };
  try { payload = await req.json(); } catch { return ok({ error: 'bad_json' }, 400); }
  const messageId = payload?.message_id;
  if (!messageId) return ok({ error: 'missing_message_id' }, 400);

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data, error } = await db.rpc('get_support_message_for_notify', { p_id: messageId });
  if (error) return ok({ error: 'rpc_failed', detail: error.message }, 500);
  if (!data)  return ok({ skipped: 'not_found' });

  const d = data as {
    conversation_id: string; subject: string | null; body: string;
    created_at: string; is_guest: boolean; sender_email: string | null;
    sender_name: string | null; notify_email: string; from_address: string;
    notify_enabled: boolean;
  };

  if (!d.notify_enabled)           return ok({ skipped: 'disabled' });
  if (!d.notify_email)             return ok({ skipped: 'no_recipient' });
  if (!RESEND_KEY)                 return ok({ skipped: 'resend_not_configured' });

  const fromAddress = (d.from_address ?? '').trim() || FROM_FALLBACK;
  const recipients = d.notify_email.split(',').map((s) => s.trim()).filter(Boolean);
  const senderLabel = d.sender_name
    ? `${d.sender_name}${d.sender_email ? ` (${d.sender_email})` : ''}`
    : (d.sender_email ?? 'Visiteur anonyme');
  const guestBadge = d.is_guest ? ' — Visiteur non connecté' : '';
  const subject    = `[Luna Support] ${d.subject ?? 'Nouveau message'} — ${senderLabel}${guestBadge}`;
  const replyUrl   = `${SITE_URL}/admin/support`;
  const excerpt    = d.body.length > 800 ? d.body.slice(0, 800) + '…' : d.body;

  const html = `
<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0f172a">
  <div style="background:#0b1f3a;color:white;padding:20px;border-radius:12px 12px 0 0">
    <p style="margin:0;font-weight:700;font-size:18px">Nouveau message support</p>
    <p style="margin:4px 0 0;font-size:13px;opacity:0.85">Luna Tracking Logistics</p>
  </div>
  <div style="border:1px solid #e2e8f0;border-top:0;padding:20px;border-radius:0 0 12px 12px;background:white">
    <p style="margin:0 0 4px;font-size:13px;color:#64748b">De</p>
    <p style="margin:0 0 16px;font-weight:600">${escapeHtml(senderLabel)}${d.is_guest ? ' <span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;margin-left:6px">Invité</span>' : ''}</p>
    ${d.subject ? `<p style="margin:0 0 4px;font-size:13px;color:#64748b">Sujet</p><p style="margin:0 0 16px;font-weight:600">${escapeHtml(d.subject)}</p>` : ''}
    <p style="margin:0 0 4px;font-size:13px;color:#64748b">Message</p>
    <div style="background:#f8fafc;border-left:3px solid #0b1f3a;padding:12px 16px;border-radius:6px;white-space:pre-wrap;margin-bottom:20px">${escapeHtml(excerpt)}</div>
    <a href="${replyUrl}" style="display:inline-block;background:#0b1f3a;color:white;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600">Répondre au client</a>
    <p style="margin:20px 0 0;font-size:12px;color:#94a3b8">Vous recevez cet email car vous êtes le destinataire des notifications de messagerie Luna. Vous pouvez changer l'adresse ou couper les notifications dans <a href="${SITE_URL}/admin/support" style="color:#94a3b8">le tableau de bord admin</a>.</p>
  </div>
</body></html>`;

  const text = `Nouveau message support Luna Tracking

De : ${senderLabel}${d.is_guest ? ' (visiteur non connecté)' : ''}
${d.subject ? `Sujet : ${d.subject}\n` : ''}
${excerpt}

Répondre : ${replyUrl}
`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from: fromAddress,
      to: recipients,
      reply_to: d.sender_email ?? undefined,
      subject,
      html,
      text,
      tags: [{ name: 'category', value: 'support_notify' }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return ok({ error: 'resend_failed', status: res.status, detail }, 502);
  }
  const body = await res.json().catch(() => ({}));
  return ok({ sent: true, resend_id: body?.id ?? null, recipients: recipients.length });
});
