// support-notify — e-mails the office (platform_settings.support_notification_email)
// whenever a public submission lands: a client/guest support message (Contact,
// /tarifs + /calculateur quote requests, chat bubble), a /reexpedition
// forwarding request, or an /achat-envoi order.
//
// Invoked by pg_net from public.enqueue_office_notification() with
// { kind, id }. Authorisation is the office_notifications ledger: the
// function only sends for a row it can atomically claim from `pending`,
// and only SECURITY DEFINER triggers create those rows — so a forged POST
// can never create a new e-mail or repeat one. Every outcome is written
// back to the ledger row (sent / skipped / failed + detail), never lost.
//
// Diagnose mode: POST { "diagnose": true } with the service-role key as
// Bearer → reports whether RESEND_API_KEY is set and the Resend domain
// status (no e-mail sent). Used to verify the setup without a test send.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_KEY   = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM_FALLBACK = 'Luna Support <support@lunatrackinglogistics.com>';
const SITE_URL     = Deno.env.get('SITE_URL') ?? 'https://lunatrackinglogistics.com';

type Kind = 'support_message' | 'forwarding_request' | 'order';
const KINDS: Kind[] = ['support_message', 'forwarding_request', 'order'];

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
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

type Mail = {
  subject: string; heading: string; replyTo: string | null;
  rows: Array<[string, string]>; body: string | null;
  cta: { label: string; url: string };
  notifyEmail: string; fromAddress: string; enabled: boolean;
  /** Addresses to leave off this round (the staff member who replied). */
  exclude?: string[];
};

function renderHtml(m: Mail): string {
  const rows = m.rows
    .filter(([, v]) => (v ?? '').toString().trim().length > 0)
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#64748b;font-size:13px;vertical-align:top">${escapeHtml(k)}</td><td style="padding:4px 0;font-weight:600">${escapeHtml(v)}</td></tr>`)
    .join('');
  return `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0f172a">
  <div style="background:#0b1f3a;color:white;padding:20px;border-radius:12px 12px 0 0">
    <p style="margin:0;font-weight:700;font-size:18px">${escapeHtml(m.heading)}</p>
    <p style="margin:4px 0 0;font-size:13px;opacity:0.85">Luna Tracking Logistics</p>
  </div>
  <div style="border:1px solid #e2e8f0;border-top:0;padding:20px;border-radius:0 0 12px 12px;background:white">
    <table style="border-collapse:collapse;margin-bottom:16px">${rows}</table>
    ${m.body ? `<p style="margin:0 0 4px;font-size:13px;color:#64748b">Message</p>
    <div style="background:#f8fafc;border-left:3px solid #0b1f3a;padding:12px 16px;border-radius:6px;white-space:pre-wrap;margin-bottom:20px">${escapeHtml(m.body)}</div>` : ''}
    <a href="${m.cta.url}" style="display:inline-block;background:#0b1f3a;color:white;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600">${escapeHtml(m.cta.label)}</a>
    <p style="margin:20px 0 0;font-size:12px;color:#94a3b8">Destinataire et activation modifiables dans <a href="${SITE_URL}/admin/support" style="color:#94a3b8">le tableau de bord admin</a>.</p>
  </div>
</body></html>`;
}

function renderText(m: Mail): string {
  const rows = m.rows.filter(([, v]) => (v ?? '').toString().trim()).map(([k, v]) => `${k} : ${v}`).join('\n');
  return `${m.heading} — Luna Tracking Logistics\n\n${rows}\n${m.body ? `\nMessage :\n${m.body}\n` : ''}\n${m.cta.label} : ${m.cta.url}\n`;
}

// deno-lint-ignore no-explicit-any
async function buildMail(db: any, kind: Kind, id: string): Promise<Mail | null> {
  if (kind === 'support_message') {
    const { data, error } = await db.rpc('get_support_message_for_notify', { p_id: id });
    if (error) throw new Error(`rpc_failed: ${error.message}`);
    if (!data) return null;
    const d = data as {
      conversation_id: string; subject: string | null; body: string; is_guest: boolean;
      sender_role: 'client' | 'admin'; author_email: string | null; is_first: boolean;
      client_email: string | null; sender_name: string | null;
      notify_email: string; from_address: string; notify_enabled: boolean;
    };
    const clientLabel = d.sender_name
      ? `${d.sender_name}${d.client_email ? ` (${d.client_email})` : ''}`
      : (d.client_email ?? 'Visiteur anonyme');
    const body = d.body.length > 4000 ? d.body.slice(0, 4000) + '…' : d.body;
    const topic = d.subject ?? 'Conversation support';
    const common = {
      replyTo: d.client_email,
      body,
      cta: { label: 'Ouvrir la conversation', url: `${SITE_URL}/admin/support?c=${d.conversation_id}` },
      notifyEmail: d.notify_email, fromAddress: d.from_address, enabled: d.notify_enabled,
    };
    const clientRows: Array<[string, string]> = [
      ['Client', clientLabel],
      ['E-mail du client', d.client_email ?? ''],
      ['Compte', d.is_guest ? 'Invité (non connecté)' : 'Client connecté'],
      ['Sujet', topic],
    ];

    if (d.sender_role === 'admin') {
      // A colleague answered: tell the rest of the list what was said.
      return {
        ...common,
        subject: `[Luna Support] Réponse de l'équipe — ${topic} — ${clientLabel}`,
        heading: "Réponse envoyée au client par l'équipe",
        rows: [['Répondu par', d.author_email ?? 'Équipe Luna'], ...clientRows],
        exclude: d.author_email ? [d.author_email] : [],
      };
    }
    return {
      ...common,
      subject: d.is_first
        ? `[Luna Support] ${topic} — ${clientLabel}${d.is_guest ? ' — Visiteur non connecté' : ''}`
        : `[Luna Support] Nouvelle réponse du client — ${topic} — ${clientLabel}`,
      heading: d.is_first ? 'Nouveau message support' : 'Nouvelle réponse du client',
      rows: clientRows,
    };
  }

  const { data, error } = await db.rpc('get_office_notify_payload', { p_kind: kind, p_record: id });
  if (error) throw new Error(`rpc_failed: ${error.message}`);
  if (!data) return null;
  // deno-lint-ignore no-explicit-any
  const d = data as Record<string, any>;
  const base = { notifyEmail: d.notify_email ?? '', fromAddress: d.from_address ?? '', enabled: d.notify_enabled !== false };

  if (kind === 'forwarding_request') {
    return {
      ...base,
      subject: `[Luna Réexpédition] Nouvelle demande — ${d.name ?? ''}`,
      heading: 'Nouvelle demande de réexpédition',
      replyTo: d.email ?? null,
      rows: [
        ['Nom', d.name ?? ''], ['E-mail', d.email ?? ''], ['Téléphone', d.phone ?? ''],
        ['Pays d’origine', d.origin_country ?? ''],
        ['Valeur estimée', d.estimated_value != null ? String(d.estimated_value) : ''],
        ['Référence', d.id],
      ],
      body: d.description ?? null,
      cta: { label: 'Voir les demandes', url: `${SITE_URL}/admin` },
    };
  }

  // order
  const items = Array.isArray(d.items) ? d.items : [];
  const itemLines = items.map((it: Record<string, unknown>) => {
    const name = (it.name ?? it.title ?? it.product_name ?? it.slug ?? 'Article') as string;
    const qty = (it.quantity ?? it.qty ?? 1) as number;
    return `• ${qty} × ${name}`;
  }).join('\n');
  return {
    ...base,
    subject: `[Luna Achat & envoi] Nouvelle commande — ${d.recipient_name ?? d.customer_name ?? ''}`,
    heading: 'Nouvelle commande Achat & envoi',
    replyTo: d.customer_email ?? null,
    rows: [
      ['Client', [d.customer_name, d.customer_email].filter(Boolean).join(' — ')],
      ['Destinataire', d.recipient_name ?? ''], ['Téléphone destinataire', d.recipient_phone ?? ''],
      ['Ville', d.city_name ?? ''], ['Adresse', d.recipient_address ?? ''],
      ['Total', d.total != null ? String(d.total) : ''], ['Référence', d.id],
    ],
    body: [itemLines, d.notes ? `Notes : ${d.notes}` : ''].filter(Boolean).join('\n\n') || null,
    cta: { label: 'Voir les commandes', url: `${SITE_URL}/admin` },
  };
}

async function diagnose(): Promise<Response> {
  if (!RESEND_KEY) return ok({ resend_key_present: false });
  const res = await fetch('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${RESEND_KEY}` } });
  const text = await res.text();
  // deno-lint-ignore no-explicit-any
  let domains: any = text.slice(0, 500);
  try {
    // deno-lint-ignore no-explicit-any
    domains = (JSON.parse(text).data ?? []).map((d: any) => ({ name: d.name, status: d.status, region: d.region }));
  } catch { /* keep raw */ }
  return ok({ resend_key_present: true, domains_http: res.status, domains });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST')    return ok({ error: 'method_not_allowed' }, 405);

  // deno-lint-ignore no-explicit-any
  let payload: any;
  try { payload = await req.json(); } catch { return ok({ error: 'bad_json' }, 400); }

  if (payload?.diagnose === true) {
    // Service-role callers only. Compared by capability, not by string: the
    // platform may inject a different key format (sb_secret_… vs legacy JWT)
    // than the one an operator holds, so ask PostgREST whether this token can
    // run a service-role-only RPC (a no-op claim on a nil UUID).
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) return ok({ error: 'forbidden' }, 403);
    const probe = createClient(SUPABASE_URL, token, { auth: { persistSession: false } });
    const { error: probeErr } = await probe.rpc('claim_office_notification', {
      p_kind: 'order', p_record: '00000000-0000-0000-0000-000000000000',
    });
    if (probeErr) return ok({ error: 'forbidden' }, 403);
    return diagnose();
  }

  const kind = payload?.kind as Kind;
  const id   = payload?.id as string;
  if (!KINDS.includes(kind) || !id) return ok({ error: 'bad_request' }, 400);

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: claimed, error: claimErr } = await db.rpc('claim_office_notification', { p_kind: kind, p_record: id });
  if (claimErr) return ok({ error: 'claim_failed', detail: claimErr.message }, 500);
  if (!claimed)  return ok({ skipped: 'not_pending' });

  const finish = (status: string, detail: string | null, resendId: string | null = null) =>
    db.rpc('finish_office_notification', { p_kind: kind, p_record: id, p_status: status, p_detail: detail, p_resend_id: resendId });

  let mail: Mail | null;
  try { mail = await buildMail(db, kind, id); }
  catch (e) { await finish('failed', String((e as Error).message ?? e)); return ok({ error: 'payload_failed' }, 500); }

  if (!mail)              { await finish('skipped', 'record_not_found'); return ok({ skipped: 'not_found' }); }
  if (!mail.enabled)      { await finish('skipped', 'disabled');         return ok({ skipped: 'disabled' }); }
  if (!mail.notifyEmail)  { await finish('skipped', 'no_recipient');     return ok({ skipped: 'no_recipient' }); }
  if (!RESEND_KEY)        { await finish('failed', 'RESEND_API_KEY not set on the Edge Function'); return ok({ error: 'resend_not_configured' }, 500); }

  // Exclude the replying staff member (matched on their login e-mail); if
  // nobody on the list matches, everyone is notified — never under-notify.
  const excluded = new Set((mail.exclude ?? []).map((e) => e.trim().toLowerCase()));
  const recipients = mail.notifyEmail.split(',').map((s) => s.trim()).filter(Boolean)
    .filter((r) => !excluded.has(r.toLowerCase()));
  if (recipients.length === 0) { await finish('skipped', 'no_other_recipient'); return ok({ skipped: 'no_other_recipient' }); }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: mail.fromAddress.trim() || FROM_FALLBACK,
      to: recipients,
      reply_to: mail.replyTo ?? undefined,
      subject: mail.subject,
      html: renderHtml(mail),
      text: renderText(mail),
      tags: [{ name: 'category', value: kind }],
    }),
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 500);
    await finish('failed', `resend ${res.status}: ${detail}`);
    return ok({ error: 'resend_failed', status: res.status }, 502);
  }
  const body = await res.json().catch(() => ({}));
  await finish('sent', null, body?.id ?? null);
  return ok({ sent: true, resend_id: body?.id ?? null, recipients: recipients.length });
});
