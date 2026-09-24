import { useEffect, useState } from 'react';
import { Check, Package, Plane, Ship, X } from 'lucide-react';
import mapUrl from '@/assets/suivi-map.json?url';
import { routeFraction, type TrackingView } from '@/lib/tracking-view';

/**
 * Route map for the tracking result ("Suivi Luna v2", Claude Design): a
 * simplified political map (Natural Earth shapes, precomputed — no map
 * library, fetched after first paint), the shipment's real route — sea
 * Antwerp → Matadi → Kinshasa, air Brussels → Kinshasa or Brussels → Goma,
 * either direction (view.route, lib/tracking-view) — with the travelled part
 * solid and the rest dashed, and a marker whose position is derived from the
 * status (indicative, never GPS). Animations stop under prefers-reduced-motion.
 * view="preview" draws the no-search illustration (/suivi before a search,
 * and the og:image generated from it): both air corridors, nothing travelled.
 *
 * Map data: equirectangular, standard parallel 20° (x = 1081.0 + 9.397·lon,
 * y = 620 − 10·lat — fits every drawn city to 0.1). Goma and its air route
 * were added with that projection and the same curve rule as the Kinshasa
 * air route (quadratic, control point offset 12.5 % of the chord).
 */

type Pt = [number, number];
export type MapData = {
  sea: { pts: Pt[]; matadiFrac: number };
  air: { pts: Pt[] };
  airGoma: { pts: Pt[] };
  cities: { bru: Pt; mat: Pt; fih: Pt; gom: Pt };
  countries: { id?: string; n: string; d: string; c: number }[];
};

let cache: Promise<MapData> | null = null;
export function useTrackingMap(enabled: boolean): MapData | null {
  const [data, setData] = useState<MapData | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    cache ??= fetch(mapUrl).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<MapData>; });
    cache.then((d) => { if (alive) setData(d); }).catch(() => { cache = null; });
    return () => { alive = false; };
  }, [enabled]);
  return data;
}

function along(pts: Pt[], frac: number) {
  const c = [0];
  for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = c[c.length - 1] * Math.max(0, Math.min(1, frac));
  let i = 1;
  while (i < c.length - 1 && c[i] < L) i++;
  const seg = c[i] - c[i - 1] || 1;
  const u = Math.max(0, Math.min(1, (L - c[i - 1]) / seg));
  const a = pts[i - 1], b = pts[i];
  return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, ang: Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI, i };
}

const toD = (P: Pt[]) => (P.length > 1 ? 'M' + P.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') : '');
const PAL = ['#F1E4C8', '#D5E6CC', '#E6D8EA', '#F5D8C8', '#F8EFC4'];
const FONT = 'Poppins, sans-serif';

// [fr, en, x, y, show on desktop, show on mobile] — 'sea' = desktop only on sea routes.
const COUNTRY_LABELS: [string, string, number, number, 1 | 'sea', 0 | 1][] = [
  ['FRANCE', 'FRANCE', 1103, 156, 1, 1], ['ESPAGNE', 'SPAIN', 1047, 219, 1, 1], ['ROYAUME-UNI', 'UNITED KINGDOM', 1050, 72, 1, 0],
  ['ALLEMAGNE', 'GERMANY', 1200, 88, 1, 0], ['ITALIE', 'ITALY', 1206, 190, 1, 0], ['PORTUGAL', 'PORTUGAL', 995, 244, 'sea', 0],
  ['MAROC', 'MOROCCO', 1004, 318, 1, 1], ['ALGÉRIE', 'ALGERIA', 1105, 340, 1, 1], ['LIBYE', 'LIBYA', 1250, 352, 1, 1], ['ÉGYPTE', 'EGYPT', 1362, 357, 1, 1],
  ['MAURITANIE', 'MAURITANIA', 990, 420, 1, 1], ['MALI', 'MALI', 1052, 452, 1, 1], ['NIGER', 'NIGER', 1169, 449, 1, 1], ['TCHAD', 'CHAD', 1256, 469, 1, 1],
  ['SOUDAN', 'SUDAN', 1362, 462, 1, 1], ['SÉNÉGAL', 'SENEGAL', 962, 482, 'sea', 1], ['NIGERIA', 'NIGERIA', 1156, 527, 1, 1], ['CAMEROUN', 'CAMEROON', 1202, 565, 1, 1],
  ['CENTRAFRIQUE', 'CENTRAL AFR. REP.', 1285, 552, 1, 0], ['GABON', 'GABON', 1180, 642, 'sea', 0], ['CONGO', 'CONGO', 1232, 612, 1, 1],
  ['ANGOLA', 'ANGOLA', 1246, 745, 1, 1], ['ÉTHIOPIE', 'ETHIOPIA', 1453, 535, 1, 0], ['KENYA', 'KENYA', 1436, 616, 1, 0], ['TANZANIE', 'TANZANIA', 1408, 685, 1, 0],
  ['ZAMBIE', 'ZAMBIA', 1342, 756, 1, 0], ['ARABIE SAOUDITE', 'SAUDI ARABIA', 1499, 381, 1, 0], ['TURQUIE', 'TURKEY', 1414, 232, 1, 0],
  ['CÔTE D’IVOIRE', 'CÔTE D’IVOIRE', 1028, 546, 'sea', 0], ['GHANA', 'GHANA', 1072, 520, 'sea', 0],
];

type MapView = Pick<TrackingView, 'mode' | 'status' | 'reachedBeforeCancel' | 'route'>;

/** The no-search state on /suivi (and the og:image drawn from it): both air
 *  corridors, nothing travelled, a static plane — an illustration of what the
 *  tool shows, never any real shipment's position. */
const PREVIEW: MapView = { mode: 'air', status: 'in_transit', reachedBeforeCancel: null, route: { dest: 'fih', reverse: false } };
const PREVIEW_FRAC = 0.46;

export function TrackingMap({ data, view, variant, lang, labels, alt }: {
  data: MapData;
  /** A result's view, or 'preview' for the neutral no-search illustration. */
  view: MapView | 'preview';
  variant: 'desktop' | 'mobile';
  lang: 'fr' | 'en';
  labels: { bru: string; be: string; cd: string; matadi: string };
  /** Text alternative; without it the map is decorative (the result panel
   *  next to it already says everything in words). */
  alt?: string;
}) {
  const preview = view === 'preview';
  const v = preview ? PREVIEW : view;
  const mob = variant === 'mobile';
  const sea = v.mode === 'sea';
  const cancelled = v.status === 'cancelled';
  const delivered = v.status === 'delivered';
  const step = cancelled ? (v.reachedBeforeCancel ?? 'confirmed') : v.status;
  const r = v.route!;
  const goma = r.dest === 'gom';
  const line = sea ? data.sea.pts : goma ? data.airGoma.pts : data.air.pts;
  const pts = r.reverse ? [...line].reverse() : line;
  const pos = along(pts, preview ? PREVIEW_FRAC : routeFraction(step as Exclude<typeof step, 'cancelled'>, v.mode, data.sea.matadiFrac));
  const done: Pt[] = preview ? [] : [...pts.slice(0, pos.i), [pos.x, pos.y]];
  const rest: Pt[] = preview ? pts : [[pos.x, pos.y], ...pts.slice(pos.i)];
  const moving = !delivered && !cancelled;
  const s = mob ? 1.35 : 1;
  const sw = mob ? 3.2 : 2.6;
  const Icon = delivered ? Check : cancelled ? X : v.mode === 'air' ? Plane : sea ? Ship : Package;
  // lucide's Plane points up-right (-45°): turn it along the route.
  const rot = moving && v.mode === 'air' ? pos.ang + 45 : 0;
  const { bru: o, mat: mt } = data.cities;
  const k = goma ? data.cities.gom : data.cities.fih;
  const destName = goma ? 'Goma' : 'Kinshasa';
  // Goma sits on the eastern border: its label goes to the left (inside DRC).
  const kx = goma
    ? k[0] - (delivered ? (mob ? 36 : 30) : 16)
    : k[0] + (delivered ? (mob ? 36 : 30) : 16);
  const big = mob ? 21 : 17, small = mob ? 17 : 13, cf = mob ? 16 : 12.5;
  const doneStroke = cancelled ? '#8FA3BF' : '#0A1650';

  const text = (x: number, y: number, str: string, fs: number, extra: React.SVGProps<SVGTextElement> = {}) => (
    <text x={x} y={y} fill="#0A1650" fontFamily={FONT} fontSize={fs} stroke="#ffffff" strokeWidth={4}
      strokeLinejoin="round" paintOrder="stroke" {...extra}>{str}</text>
  );
  const country = (key: string, x: number, y: number, str: string, hl = false) => (
    <text key={key} x={x} y={y} textAnchor="middle" fill={hl ? '#0A1650' : '#4A5A75'} fontFamily={FONT}
      fontSize={hl ? cf + 1 : cf} fontWeight={hl ? 600 : 500} letterSpacing={1.2} stroke="#ffffff" strokeOpacity={0.85}
      strokeWidth={3} strokeLinejoin="round" paintOrder="stroke">{str}</text>
  );

  return (
    <svg viewBox={mob ? '840 70 600 725' : '125 10 1520 760'} preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 block h-full w-full" {...(alt ? { role: 'img', 'aria-label': alt } : { 'aria-hidden': true })}>
      <style>{`
        @keyframes ltlPulse { 0% { transform: scale(1); opacity: .75 } 100% { transform: scale(2.6); opacity: 0 } }
        @keyframes ltlDash { to { stroke-dashoffset: -20 } }
        .ltl-pulse { transform-box: fill-box; transform-origin: center; animation: ltlPulse 2.6s ease-out infinite }
        .ltl-dash { animation: ltlDash 1.4s linear infinite }
        @media (prefers-reduced-motion: reduce) { .ltl-pulse { display: none } .ltl-dash { animation: none } }
      `}</style>
      {data.countries.map((c, i) => {
        const hl = c.id === '056' || c.id === '180';
        return (
          <path key={(c.id ?? c.n) + i} d={c.d} fill={hl ? '#A6E3EF' : PAL[((c.c % PAL.length) + PAL.length) % PAL.length]}
            stroke={hl ? '#1FA3C9' : '#ffffff'} strokeWidth={hl ? (mob ? 1.8 : 1.4) : (mob ? 1.3 : 1)} strokeLinejoin="round" />
        );
      })}
      <path d={toD(done)} fill="none" stroke="#ffffff" strokeWidth={mob ? 10 : 8} strokeLinecap="round" strokeLinejoin="round" />
      <path d={toD(done)} fill="none" stroke={doneStroke} strokeWidth={mob ? 4 : 3} strokeLinecap="round" strokeLinejoin="round" />
      {!delivered && (
        <path d={toD(rest)} fill="none" stroke={cancelled ? '#B3C3D8' : '#2E6FD1'} strokeWidth={sw} strokeDasharray="2 8"
          strokeLinecap="round" className={moving ? 'ltl-dash' : undefined} />
      )}
      {preview && (
        <>
          <path d={toD(data.airGoma.pts)} fill="none" stroke="#2E6FD1" strokeWidth={sw} strokeDasharray="2 8"
            strokeLinecap="round" className="ltl-dash" />
          <circle cx={data.cities.gom[0]} cy={data.cities.gom[1]} r={mob ? 8 : 6} fill="#ffffff" stroke="#0A1650" strokeWidth={mob ? 3.2 : 2.6} />
        </>
      )}
      <circle cx={o[0]} cy={o[1]} r={mob ? 8 : 6} fill="#ffffff" stroke="#0A1650" strokeWidth={mob ? 3.2 : 2.6} />
      <circle cx={k[0]} cy={k[1]} r={mob ? 8 : 6} fill="#ffffff" stroke="#0A1650" strokeWidth={mob ? 3.2 : 2.6} />
      <g>
        {COUNTRY_LABELS.map(([fr, en, x, y, d, m]) => {
          const show = mob ? m === 1 : d === 1 || (d === 'sea' && sea);
          return show ? country(fr, x, y, lang === 'en' ? en : fr) : null;
        })}
        {country('cd', 1352, 700, labels.cd, true)}
        {text(o[0] + (mob ? 18 : 16), o[1] + (mob ? 30 : 26), labels.be, cf + 1, { fontWeight: 600, letterSpacing: 1.2, strokeWidth: 3 })}
        {text(o[0] + (mob ? 18 : 16), o[1] + (mob ? 7 : 6), labels.bru, big, { fontWeight: 600 })}
        {text(kx, k[1] + (mob ? -14 : 5), destName, big, { fontWeight: 600, ...(goma ? { textAnchor: 'end' } : {}) })}
        {preview && text(data.cities.gom[0] - 16, data.cities.gom[1] + (mob ? -14 : 5), 'Goma', big, { fontWeight: 600, textAnchor: 'end' })}
        {sea && (
          <>
            <circle cx={mt[0]} cy={mt[1]} r={mob ? 4.5 : 3.5} fill="#0A1650" />
            {text(mt[0] - 12, mt[1] + (mob ? 30 : 24), labels.matadi, small, { textAnchor: 'end', fontWeight: 500 })}
          </>
        )}
      </g>
      <g transform={`translate(${pos.x.toFixed(1)} ${pos.y.toFixed(1)}) scale(${s})`}>
        {moving && !preview && <circle r={20} fill="none" stroke="#2E6FD1" strokeWidth={2} className="ltl-pulse" />}
        <circle r={30} fill="#0A1650" opacity={0.12} />
        <circle r={20} fill={delivered ? '#1FE0F0' : cancelled ? '#ffffff' : '#0A1650'}
          stroke={delivered ? '#0A1650' : cancelled ? '#8FA3BF' : '#ffffff'} strokeWidth={3} />
        <g transform={rot ? `rotate(${rot.toFixed(0)})` : undefined}>
          <Icon x={-11} y={-11} width={22} height={22} strokeWidth={2.2}
            color={delivered ? '#0A1650' : cancelled ? '#4A5A75' : '#1FE0F0'} aria-hidden="true" />
        </g>
      </g>
    </svg>
  );
}
