import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Code2, Zap, Key, Server, ArrowRight, CheckCircle2, AlertTriangle,
  Copy, Check, Info, ShieldCheck, Layers, Send, BookOpen,
} from 'lucide-react';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { urlFor } from '@/lib/url/routes';
import { cn } from '@/lib/utils';

/**
 * Public API documentation, pedagogical tone. Beginners land here and
 * should be able to make their first successful API call in ~3 minutes,
 * without a subscription and without reading anything else.
 *
 * Diagrams are inline SVG so we don't pull an external chart library.
 */

const API_BASE = 'https://zlpzajjfzezjildvchoz.functions.supabase.co/api-v1';

export default function ApiDocs() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('en') ? 'en' : 'fr';

  return (
    <div className="min-h-[70vh]">
      <SEO
        title={t('api_docs.meta_title')}
        description={t('api_docs.meta_description')}
      />

      {/* Hero */}
      <section className="bg-luna-gradient text-white">
        <div className="max-w-4xl mx-auto px-4 py-14 text-center">
          <Code2 className="h-10 w-10 mx-auto opacity-90" aria-hidden="true" />
          <h1 className="mt-3 text-3xl md:text-4xl font-bold">{t('api_docs.hero_title')}</h1>
          <p className="mt-3 text-white/90 text-base md:text-lg max-w-2xl mx-auto">
            {t('api_docs.hero_intro')}
          </p>
          <div className="mt-6 flex flex-wrap gap-3 justify-center">
            <a href="#quickstart">
              <Button variant="secondary">
                <Zap className="h-4 w-4" />
                {t('api_docs.hero_cta_quickstart')}
              </Button>
            </a>
            <Button asChild variant="outline" className="bg-white/10 border-white/30 text-white hover:bg-white/20">
              <Link to={urlFor('login', lang)}>
                <Key className="h-4 w-4" />
                {t('api_docs.hero_cta_get_key')}
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Table of contents */}
      <section className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 overflow-x-auto">
          <nav className="flex gap-4 text-sm whitespace-nowrap text-slate-600">
            <TocLink href="#what">{t('api_docs.toc_what')}</TocLink>
            <TocLink href="#today">{t('api_docs.toc_today')}</TocLink>
            <TocLink href="#quickstart">{t('api_docs.toc_quickstart')}</TocLink>
            <TocLink href="#auth">{t('api_docs.toc_auth')}</TocLink>
            <TocLink href="#responses">{t('api_docs.toc_responses')}</TocLink>
            <TocLink href="#endpoints">{t('api_docs.toc_endpoints')}</TocLink>
            <TocLink href="#errors">{t('api_docs.toc_errors')}</TocLink>
            <TocLink href="#limits">{t('api_docs.toc_limits')}</TocLink>
            <TocLink href="#roadmap">{t('api_docs.toc_roadmap')}</TocLink>
          </nav>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-4 py-10 space-y-16">
        {/* WHAT IS AN API */}
        <SectionBlock id="what" icon={BookOpen} title={t('api_docs.what_title')}>
          <p>{t('api_docs.what_p1')}</p>
          <p>{t('api_docs.what_p2')}</p>

          <DiagramClientApiDb
            labelClient={t('api_docs.diag_client')}
            labelApi={t('api_docs.diag_api')}
            labelDb={t('api_docs.diag_db')}
            labelRequest={t('api_docs.diag_request')}
            labelResponse={t('api_docs.diag_response')}
          />

          <Callout kind="info" title={t('api_docs.what_analogy_title')}>
            <p>{t('api_docs.what_analogy_body')}</p>
          </Callout>
        </SectionBlock>

        {/* WHAT CAN YOU DO TODAY */}
        <SectionBlock id="today" icon={Zap} title={t('api_docs.today_title')}>
          <p>{t('api_docs.today_intro')}</p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              { title: t('api_docs.today_c1_t'), body: t('api_docs.today_c1_b') },
              { title: t('api_docs.today_c2_t'), body: t('api_docs.today_c2_b') },
              { title: t('api_docs.today_c3_t'), body: t('api_docs.today_c3_b') },
              { title: t('api_docs.today_c4_t'), body: t('api_docs.today_c4_b') },
            ].map((c, i) => (
              <li key={i} className="rounded-xl border-2 border-luna-blue/20 bg-luna-blue/5 p-4">
                <p className="font-semibold text-luna-navy flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-luna-blue" />
                  {c.title}
                </p>
                <p className="mt-1 text-sm text-slate-600">{c.body}</p>
              </li>
            ))}
          </ul>
        </SectionBlock>

        {/* QUICKSTART */}
        <SectionBlock id="quickstart" icon={Send} title={t('api_docs.quick_title')}>
          <p>{t('api_docs.quick_intro')}</p>

          <Step number={1} title={t('api_docs.quick_s1_title')}>
            <p>{t('api_docs.quick_s1_body')}</p>
            <MultiCodeBlock samples={[
              { label: 'cURL', code: `curl ${API_BASE}/health` },
              { label: 'JavaScript', code: `const res = await fetch('${API_BASE}/health');
const { data } = await res.json();
console.log(data);
// → { status: 'ok', version: 'v1', time: '...' }` },
              { label: 'Python', code: `import requests

res = requests.get('${API_BASE}/health')
print(res.json())
# → {'data': {'status': 'ok', 'version': 'v1', 'time': '...'}}` },
            ]} />
            <p className="mt-2 text-sm text-slate-600">{t('api_docs.quick_s1_expect')}</p>
            <CodeBlock code={`{
  "data": {
    "status": "ok",
    "version": "v1",
    "time": "2026-09-07T12:00:00.000Z"
  }
}`} />
            <Callout kind="ok" title={t('api_docs.quick_s1_check_title')}>
              <p>{t('api_docs.quick_s1_check_body')}</p>
            </Callout>
          </Step>

          <Step number={2} title={t('api_docs.quick_s2_title')}>
            <p>{t('api_docs.quick_s2_body')}</p>
            <ol className="mt-3 list-decimal ml-5 space-y-2 text-slate-700">
              <li>{t('api_docs.quick_s2_l1')}</li>
              <li>{t('api_docs.quick_s2_l2')}</li>
              <li>{t('api_docs.quick_s2_l3')}</li>
              <li>{t('api_docs.quick_s2_l4')}</li>
            </ol>
            <div className="mt-3">
              <Button asChild variant="navy">
                <Link to={urlFor('signup', lang)}>
                  <Key className="h-4 w-4" />
                  {t('api_docs.quick_s2_cta')}
                </Link>
              </Button>
            </div>
            <Callout kind="warning" title={t('api_docs.quick_s2_warn_title')}>
              <p>{t('api_docs.quick_s2_warn_body')}</p>
            </Callout>
          </Step>

          <Step number={3} title={t('api_docs.quick_s3_title')}>
            <p>{t('api_docs.quick_s3_body')}</p>
            <MultiCodeBlock samples={[
              { label: 'cURL', code: `curl "${API_BASE}/shipments?business_id=YOUR_BUSINESS_ID" \\
  -H "Authorization: ApiKey lk_live_xxxxxxxx.YOUR_SECRET"` },
              { label: 'JavaScript', code: `const BUSINESS_ID = 'YOUR_BUSINESS_ID';
const API_KEY = 'lk_live_xxxxxxxx.YOUR_SECRET';

const res = await fetch(
  \`${API_BASE}/shipments?business_id=\${BUSINESS_ID}\`,
  { headers: { Authorization: \`ApiKey \${API_KEY}\` } }
);
const { data, error } = await res.json();
if (error) throw new Error(error.message);
console.log(data);   // array of shipments` },
              { label: 'Python', code: `import requests

BUSINESS_ID = 'YOUR_BUSINESS_ID'
API_KEY = 'lk_live_xxxxxxxx.YOUR_SECRET'

res = requests.get(
    '${API_BASE}/shipments',
    params={'business_id': BUSINESS_ID},
    headers={'Authorization': f'ApiKey {API_KEY}'},
)
res.raise_for_status()
payload = res.json()
if 'error' in payload:
    raise RuntimeError(payload['error']['message'])
print(payload['data'])   # list of shipments` },
            ]} />
            <p className="mt-2 text-sm text-slate-600">{t('api_docs.quick_s3_expect')}</p>
            <CodeBlock code={`{
  "data": [
    {
      "id": "8d3f...",
      "reference": "SHP-2026-00042",
      "status": "in_transit",
      "direction": "export",
      "mode": "air",
      "origin_city": "Brussels",
      "destination_city": "Kinshasa"
    }
  ],
  "meta": { "count": 1, "limit": 50 }
}`} />
          </Step>
        </SectionBlock>

        {/* AUTH */}
        <SectionBlock id="auth" icon={ShieldCheck} title={t('api_docs.auth_title')}>
          <p>{t('api_docs.auth_intro')}</p>

          <DiagramAuthFlow
            labelHeader={t('api_docs.diag_auth_header')}
            labelVerify={t('api_docs.diag_auth_verify')}
            labelData={t('api_docs.diag_auth_data')}
            labelForbid={t('api_docs.diag_auth_forbid')}
          />

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <AuthCard
              kind="bearer"
              title={t('api_docs.auth_bearer_title')}
              body={t('api_docs.auth_bearer_body')}
              example={`Authorization: Bearer eyJhbGciOi...`}
            />
            <AuthCard
              kind="apikey"
              title={t('api_docs.auth_apikey_title')}
              body={t('api_docs.auth_apikey_body')}
              example={`Authorization: ApiKey lk_live_xxxxxxxx.YOUR_SECRET`}
            />
          </div>

          <Callout kind="warning" title={t('api_docs.auth_never_title')}>
            <p>{t('api_docs.auth_never_body')}</p>
          </Callout>
        </SectionBlock>

        {/* RESPONSES */}
        <SectionBlock id="responses" icon={Layers} title={t('api_docs.resp_title')}>
          <p>{t('api_docs.resp_intro')}</p>
          <div className="grid gap-4 md:grid-cols-2">
            <EnvelopeCard kind="ok" title={t('api_docs.resp_ok_title')} example={`{
  "data": [ /* ... */ ],
  "meta": { "count": 42 }
}`} />
            <EnvelopeCard kind="err" title={t('api_docs.resp_err_title')} example={`{
  "error": {
    "code": "unauthorized",
    "message": "authentication required"
  }
}`} />
          </div>
          <Callout kind="info" title={t('api_docs.resp_header_title')}>
            <p>{t('api_docs.resp_header_body')}</p>
            <pre className="mt-2 rounded bg-white/60 border border-slate-200 p-2 text-xs font-mono">X-Api-Version: v1</pre>
          </Callout>
        </SectionBlock>

        {/* ENDPOINTS */}
        <SectionBlock id="endpoints" icon={Server} title={t('api_docs.ep_title')}>
          <p>{t('api_docs.ep_intro')}</p>

          <EndpointGroup title={t('api_docs.ep_group_public')}>
            <EndpointRow method="GET" path="/health" auth="—" body={t('api_docs.ep_health')} />
            <EndpointRow method="GET" path="/" auth="—" body={t('api_docs.ep_root')} />
            <EndpointRow method="GET" path="/rates?origin=..&destination=..&weight_kg=.." auth="—" body={t('api_docs.ep_rates')} />
            <EndpointRow method="GET" path="/tracking/:token" auth="—" body={t('api_docs.ep_tracking')} />
          </EndpointGroup>

          <EndpointGroup title={t('api_docs.ep_group_scoped')}>
            <EndpointRow method="GET" path="/me" auth="JWT" body={t('api_docs.ep_me')} />
            <EndpointRow method="GET" path="/shipments?business_id=.." auth="JWT / ApiKey" body={t('api_docs.ep_ship_list')} />
            <EndpointRow method="GET" path="/shipments/:id" auth="JWT / ApiKey" body={t('api_docs.ep_ship_get')} />
            <EndpointRow method="GET" path="/customers?business_id=.." auth="JWT / ApiKey" body={t('api_docs.ep_cust_list')} />
            <EndpointRow method="GET" path="/customers/:id" auth="JWT / ApiKey" body={t('api_docs.ep_cust_get')} />
            <EndpointRow method="GET" path="/usage/summary?business_id=..&range=24h|7d|30d" auth="JWT / ApiKey" body={t('api_docs.ep_usage')} />
          </EndpointGroup>

          <Callout kind="info" title={t('api_docs.ep_perms_title')}>
            <p>{t('api_docs.ep_perms_body')}</p>
            <ul className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1 text-xs font-mono text-slate-700">
              {['shipments.read', 'shipments.write', 'customers.read', 'customers.write',
                'quotes.read', 'quotes.write', 'rates.read', 'tracking.read'].map((s) => (
                <li key={s} className="rounded bg-white border border-slate-200 px-2 py-1">{s}</li>
              ))}
            </ul>
          </Callout>
        </SectionBlock>

        {/* ERRORS */}
        <SectionBlock id="errors" icon={AlertTriangle} title={t('api_docs.err_title')}>
          <p>{t('api_docs.err_intro')}</p>
          <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-luna-navy">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold">HTTP</th>
                  <th className="text-left px-4 py-2 font-semibold">{t('api_docs.err_col_code')}</th>
                  <th className="text-left px-4 py-2 font-semibold">{t('api_docs.err_col_meaning')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[
                  { http: 400, code: 'missing_param',   meaning: t('api_docs.err_missing_param') },
                  { http: 400, code: 'bad_id',          meaning: t('api_docs.err_bad_id') },
                  { http: 401, code: 'unauthorized',    meaning: t('api_docs.err_unauth') },
                  { http: 403, code: 'forbidden',       meaning: t('api_docs.err_forbid') },
                  { http: 404, code: 'not_found',       meaning: t('api_docs.err_not_found') },
                  { http: 500, code: 'db_error',        meaning: t('api_docs.err_db') },
                  { http: 500, code: 'internal',        meaning: t('api_docs.err_internal') },
                ].map((r) => (
                  <tr key={r.code}>
                    <td className="px-4 py-2 font-mono text-slate-700">{r.http}</td>
                    <td className="px-4 py-2 font-mono text-luna-navy">{r.code}</td>
                    <td className="px-4 py-2 text-slate-700">{r.meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionBlock>

        {/* LIMITS */}
        <SectionBlock id="limits" icon={Zap} title={t('api_docs.limits_title')}>
          <p>{t('api_docs.limits_intro')}</p>
          <Callout kind="info" title={t('api_docs.limits_free_title')}>
            <p>{t('api_docs.limits_free_body')}</p>
          </Callout>
        </SectionBlock>

        {/* ROADMAP */}
        <SectionBlock id="roadmap" icon={ArrowRight} title={t('api_docs.roadmap_title')}>
          <p>{t('api_docs.roadmap_intro')}</p>
          <ul className="mt-4 space-y-2 text-slate-700">
            {[t('api_docs.roadmap_i1'), t('api_docs.roadmap_i2'), t('api_docs.roadmap_i3'), t('api_docs.roadmap_i4')].map((it, i) => (
              <li key={i} className="flex items-start gap-2">
                <ArrowRight className="h-4 w-4 text-luna-blue mt-1 shrink-0" aria-hidden="true" />
                <span>{it}</span>
              </li>
            ))}
          </ul>
        </SectionBlock>

        {/* CTA */}
        <section className="rounded-2xl bg-luna-navy text-white p-6 text-center">
          <h2 className="text-xl font-bold">{t('api_docs.cta_title')}</h2>
          <p className="mt-2 text-white/85 max-w-xl mx-auto">{t('api_docs.cta_body')}</p>
          <div className="mt-4 flex gap-3 justify-center flex-wrap">
            <Button asChild variant="secondary">
              <Link to={urlFor('signup', lang)}>
                <Key className="h-4 w-4" />
                {t('api_docs.cta_signup')}
              </Link>
            </Button>
            <Button asChild variant="outline" className="bg-white/10 border-white/30 text-white hover:bg-white/20">
              <Link to={urlFor('contact', lang)}>{t('api_docs.cta_contact')}</Link>
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ─── Small building blocks ────────────────────────────────────── */

function SectionBlock({
  id, icon: Icon, title, children,
}: { id: string; icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="text-2xl md:text-3xl font-bold text-luna-navy flex items-center gap-3">
        <span className="rounded-xl bg-luna-blue/10 text-luna-blue p-2">
          <Icon className="h-6 w-6" />
        </span>
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-slate-700 leading-relaxed">{children}</div>
    </section>
  );
}

function TocLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="hover:text-luna-blue">{children}</a>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-2xl border-2 border-amber-500 bg-amber-50 p-5">
      <div className="flex items-center gap-3">
        <span className="shrink-0 h-8 w-8 rounded-full bg-luna-navy text-white font-bold flex items-center justify-center">
          {number}
        </span>
        <h3 className="text-lg font-bold text-luna-navy">{title}</h3>
      </div>
      <div className="mt-3 space-y-3 text-slate-700">{children}</div>
    </div>
  );
}

function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };
  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-luna-navy overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-luna-navy-deep">
        <span className="text-[11px] font-mono text-white/60 uppercase tracking-wide">
          {label ?? 'JSON'}
        </span>
        <button type="button" onClick={copy}
          className="text-white/70 hover:text-white text-xs inline-flex items-center gap-1">
          {copied ? <><Check className="h-3 w-3" /> copied</> : <><Copy className="h-3 w-3" /> copy</>}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-[12px] font-mono text-emerald-100 leading-relaxed">{code}</pre>
    </div>
  );
}

/** Same as CodeBlock but with tabs — one per language. The copy button
 *  copies whatever tab is currently active. */
function MultiCodeBlock({ samples }: { samples: { label: string; code: string }[] }) {
  const [idx, setIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const active = samples[idx];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(active.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };
  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-luna-navy overflow-hidden">
      <div className="flex items-center justify-between bg-luna-navy-deep pr-3">
        <div className="flex" role="tablist" aria-label="Code language">
          {samples.map((s, i) => (
            <button key={s.label} type="button" role="tab" aria-selected={idx === i}
              onClick={() => { setIdx(i); setCopied(false); }}
              className={cn(
                'px-3 py-1.5 text-[11px] font-mono uppercase tracking-wide border-b-2',
                idx === i ? 'text-white border-luna-cyan bg-white/5' : 'text-white/50 border-transparent hover:text-white/80',
              )}>
              {s.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={copy}
          className="text-white/70 hover:text-white text-xs inline-flex items-center gap-1">
          {copied ? <><Check className="h-3 w-3" /> copied</> : <><Copy className="h-3 w-3" /> copy</>}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-[12px] font-mono text-emerald-100 leading-relaxed">{active.code}</pre>
    </div>
  );
}

function Callout({
  kind, title, children,
}: { kind: 'info' | 'ok' | 'warning'; title: string; children: React.ReactNode }) {
  const styles = kind === 'info'
    ? 'border-luna-blue/30 bg-luna-blue/5 text-luna-navy'
    : kind === 'ok'
    ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
    : 'border-amber-400 bg-amber-50 text-amber-900';
  const Icon = kind === 'warning' ? AlertTriangle : kind === 'ok' ? CheckCircle2 : Info;
  return (
    <div className={cn('mt-4 rounded-xl border p-4', styles)}>
      <p className="font-semibold flex items-center gap-2">
        <Icon className="h-4 w-4" aria-hidden="true" />
        {title}
      </p>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}

function AuthCard({ kind, title, body, example }: { kind: 'bearer' | 'apikey'; title: string; body: string; example: string }) {
  return (
    <div className={cn(
      'rounded-2xl border-2 p-4',
      kind === 'apikey' ? 'border-luna-blue/30 bg-luna-blue/5' : 'border-slate-200 bg-white',
    )}>
      <p className="font-semibold text-luna-navy flex items-center gap-2">
        {kind === 'apikey' ? <Key className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
        {title}
      </p>
      <p className="mt-1 text-sm text-slate-600">{body}</p>
      <pre className="mt-3 rounded bg-luna-navy text-emerald-100 text-[11px] p-2 overflow-x-auto font-mono">{example}</pre>
    </div>
  );
}

function EnvelopeCard({ kind, title, example }: { kind: 'ok' | 'err'; title: string; example: string }) {
  return (
    <div className={cn(
      'rounded-2xl border-2 p-4',
      kind === 'ok' ? 'border-emerald-300 bg-emerald-50' : 'border-red-300 bg-red-50',
    )}>
      <p className={cn(
        'font-semibold flex items-center gap-2',
        kind === 'ok' ? 'text-emerald-900' : 'text-red-900',
      )}>
        {kind === 'ok' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
        {title}
      </p>
      <pre className={cn(
        'mt-3 rounded p-3 overflow-x-auto text-[12px] font-mono',
        kind === 'ok' ? 'bg-white text-slate-800' : 'bg-white text-slate-800',
      )}>{example}</pre>
    </div>
  );
}

function EndpointGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <h3 className="text-lg font-semibold text-luna-navy mb-2">{title}</h3>
      <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
        {children}
      </div>
    </div>
  );
}

function EndpointRow({ method, path, auth, body }: { method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; path: string; auth: string; body: string }) {
  return (
    <div className="grid gap-2 md:grid-cols-[70px_1fr_120px] items-start px-4 py-3">
      <span className={cn(
        'inline-block w-fit rounded px-2 py-0.5 text-[11px] font-mono font-semibold',
        method === 'GET' ? 'bg-emerald-100 text-emerald-800' : 'bg-luna-blue/10 text-luna-blue',
      )}>{method}</span>
      <div className="min-w-0">
        <p className="font-mono text-sm text-luna-navy break-all">{path}</p>
        <p className="mt-0.5 text-xs text-slate-600">{body}</p>
      </div>
      <span className="text-xs text-slate-500 md:text-right">{auth}</span>
    </div>
  );
}

/* ─── SVG diagrams ─────────────────────────────────────────────── */

function DiagramClientApiDb({
  labelClient, labelApi, labelDb, labelRequest, labelResponse,
}: { labelClient: string; labelApi: string; labelDb: string; labelRequest: string; labelResponse: string }) {
  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 overflow-x-auto">
      <svg viewBox="0 0 720 220" className="w-full min-w-[560px]" role="img" aria-label={`${labelClient} → ${labelApi} → ${labelDb}`}>
        {/* Client */}
        <g>
          <rect x="20"  y="70"  width="160" height="80"  rx="14" fill="#F1F5F9" stroke="#94A3B8" strokeWidth="2" />
          <text x="100" y="115" textAnchor="middle" fontSize="16" fontWeight="700" fill="#0F172A">{labelClient}</text>
        </g>
        {/* API */}
        <g>
          <rect x="280" y="60"  width="160" height="100" rx="14" fill="#0F172A" />
          <text x="360" y="105" textAnchor="middle" fontSize="18" fontWeight="700" fill="#F8FAFC">Luna API</text>
          <text x="360" y="128" textAnchor="middle" fontSize="12" fill="#94A3B8">/api/v1</text>
        </g>
        {/* DB */}
        <g>
          <ellipse cx="620" cy="80" rx="70" ry="18" fill="#059669" />
          <rect x="550" y="80" width="140" height="60" fill="#059669" />
          <ellipse cx="620" cy="140" rx="70" ry="18" fill="#047857" />
          <text x="620" y="115" textAnchor="middle" fontSize="15" fontWeight="700" fill="#F0FDF4">{labelDb}</text>
        </g>
        {/* Arrows */}
        <defs>
          <marker id="arrhead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="#334155" />
          </marker>
        </defs>
        <line x1="185" y1="100" x2="275" y2="100" stroke="#334155" strokeWidth="2" markerEnd="url(#arrhead)" />
        <text x="230" y="90" textAnchor="middle" fontSize="11" fill="#475569">{labelRequest}</text>
        <line x1="275" y1="130" x2="185" y2="130" stroke="#334155" strokeWidth="2" markerEnd="url(#arrhead)" />
        <text x="230" y="150" textAnchor="middle" fontSize="11" fill="#475569">{labelResponse}</text>

        <line x1="445" y1="100" x2="545" y2="100" stroke="#334155" strokeWidth="2" markerEnd="url(#arrhead)" />
        <line x1="545" y1="130" x2="445" y2="130" stroke="#334155" strokeWidth="2" markerEnd="url(#arrhead)" />

        {/* Labels below */}
        <text x="100" y="180" textAnchor="middle" fontSize="11" fill="#64748B">curl / JS / Python…</text>
        <text x="360" y="180" textAnchor="middle" fontSize="11" fill="#64748B">auth · logs · règles</text>
      </svg>
    </div>
  );
}

function DiagramAuthFlow({
  labelHeader, labelVerify, labelData, labelForbid,
}: { labelHeader: string; labelVerify: string; labelData: string; labelForbid: string }) {
  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 overflow-x-auto">
      <svg viewBox="0 0 720 260" className="w-full min-w-[560px]" role="img" aria-label="auth flow">
        <defs>
          <marker id="arrhead2" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="#334155" />
          </marker>
        </defs>
        {/* Request */}
        <rect x="20"  y="30"  width="200" height="80" rx="14" fill="#EFF6FF" stroke="#3B82F6" strokeWidth="2" />
        <text x="120" y="60"  textAnchor="middle" fontSize="13" fontWeight="700" fill="#1E3A8A">HTTP request</text>
        <text x="120" y="82"  textAnchor="middle" fontSize="11" fill="#1E40AF">{labelHeader}</text>
        {/* Verify */}
        <rect x="280" y="30"  width="160" height="80" rx="14" fill="#0F172A" />
        <text x="360" y="60"  textAnchor="middle" fontSize="13" fontWeight="700" fill="#F8FAFC">api-v1</text>
        <text x="360" y="82"  textAnchor="middle" fontSize="11" fill="#94A3B8">{labelVerify}</text>
        {/* OK path */}
        <rect x="500" y="0"   width="200" height="70" rx="14" fill="#DCFCE7" stroke="#059669" strokeWidth="2" />
        <text x="600" y="30"  textAnchor="middle" fontSize="13" fontWeight="700" fill="#065F46">200 OK</text>
        <text x="600" y="52"  textAnchor="middle" fontSize="11" fill="#047857">{labelData}</text>
        {/* Fail path */}
        <rect x="500" y="90"  width="200" height="70" rx="14" fill="#FEE2E2" stroke="#DC2626" strokeWidth="2" />
        <text x="600" y="120" textAnchor="middle" fontSize="13" fontWeight="700" fill="#991B1B">401 / 403</text>
        <text x="600" y="142" textAnchor="middle" fontSize="11" fill="#B91C1C">{labelForbid}</text>

        {/* Arrows */}
        <line x1="225" y1="70" x2="275" y2="70" stroke="#334155" strokeWidth="2" markerEnd="url(#arrhead2)" />
        <line x1="445" y1="55" x2="495" y2="35" stroke="#334155" strokeWidth="2" markerEnd="url(#arrhead2)" />
        <line x1="445" y1="90" x2="495" y2="115" stroke="#334155" strokeWidth="2" markerEnd="url(#arrhead2)" />

        {/* Legend */}
        <text x="360" y="200" textAnchor="middle" fontSize="12" fill="#334155" fontWeight="600">
          Bearer JWT (users) · ApiKey lk_live_… (integrations)
        </text>
      </svg>
    </div>
  );
}
