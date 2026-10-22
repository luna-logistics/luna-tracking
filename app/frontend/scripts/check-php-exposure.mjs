/**
 * PHP exposure check — run it on every PHP security alert (`pnpm check-php`).
 *
 * Luna's production serves NO PHP (Cloudflare Workers static assets + Supabase),
 * so the real risks are (1) PHP sneaking into what we deploy and (2) the PHP
 * runtimes installed on the developer machine (WordPress Studio, XAMPP).
 *
 * Checks
 *   1. No PHP-family file in public/ or dist/ (and none tracked by git).
 *   2. Production answers carry no PHP / Apache / LiteSpeed fingerprint.
 *   3. The PHP bundled with WordPress Studio / found on this machine is at a
 *      fixed version. Versions are read from directory names and `php -v` on
 *      PATH only — no site is started, nothing is installed.
 *   4. public/_headers has no ENFORCING Content-Security-Policy (we ship it
 *      Report-Only until the violation list has been reviewed).
 *
 * Modes
 *   pnpm check-php                full run (offline checks + production + machine)
 *   pnpm check-php -- --offline   skip the production request
 *   node scripts/check-php-exposure.mjs --ci   only the checks that make sense on
 *                                 a build runner (1 and 4); wired into `pnpm build`
 *
 * Exit code 1 on any FAIL; WARN never fails. Prints no secret, reads no .env.
 *
 * ── TO UPDATE ON EACH PHP ALERT ─────────────────────────────────────────────
 * Edit FIXED_PHP below from the php.net announcement, then re-run.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

// Last advisory taken into account: php.net, 2026-10-21 — CVE-2026-109618 / CVE-2026-109619.
export const FIXED_PHP = { '8.2': '8.2.35', '8.3': '8.3.36', '8.4': '8.4.27', '8.5': '8.5.12' };
export const PROD_ORIGIN = 'https://lunatrackinglogistics.com';

const PHP_EXT = new Set(['.php', '.php3', '.php4', '.php5', '.php7', '.php8', '.phtml', '.phar', '.pht', '.phps']);
const PHP_NAMES = new Set(['.htaccess', '.user.ini', 'php.ini', 'composer.json', 'composer.lock']);

/** 'a.b.c' -> [a,b,c]; null when it does not parse. */
export function parseVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Status of one PHP version against FIXED_PHP: 'fixed' | 'exposed' | 'unsupported' | 'unknown'. */
export function classifyPhp(version, fixed = FIXED_PHP) {
  const p = parseVersion(version);
  if (!p) return 'unknown';
  const target = fixed[`${p[0]}.${p[1]}`];
  if (!target) {
    const oldest = Math.min(...Object.keys(fixed).map((k) => Number(k.split('.')[0]) * 100 + Number(k.split('.')[1])));
    return p[0] * 100 + p[1] < oldest ? 'unsupported' : 'unknown';
  }
  const t = parseVersion(target);
  for (let i = 0; i < 3; i++) {
    if (p[i] > t[i]) return 'fixed';
    if (p[i] < t[i]) return 'exposed';
  }
  return 'fixed';
}

/** Recursively list files, skipping node_modules and .git. */
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

export function isPhpFamily(file) {
  const base = basename(file).toLowerCase();
  return PHP_EXT.has(extname(base)) || PHP_NAMES.has(base);
}

/** Check 1 — PHP-family files in the deployable trees. */
export function findPhpFiles(root) {
  return ['public', 'dist'].flatMap((d) => walk(join(root, d))).filter(isPhpFamily);
}

/** Check 4 — an enforcing CSP line in _headers (Report-Only is the only allowed form). */
export function findEnforcingCsp(headersText) {
  return headersText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^content-security-policy\s*:/i.test(l));
}

function trackedPhpFiles(root) {
  try {
    const out = execFileSync('git', ['ls-files', ':/'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\n').filter(Boolean).filter((f) => !f.includes('node_modules/') && isPhpFamily(f));
  } catch {
    return null; // not a git checkout (e.g. build runner) — skip
  }
}

/** Studio / XAMPP PHP runtimes on this machine, from directory names. */
function machinePhpRuntimes() {
  if (process.platform !== 'win32') return [];
  const found = [];
  const local = process.env.LOCALAPPDATA;
  const roots = [];
  if (local && existsSync(join(local, 'studio_app'))) {
    for (const app of readdirSync(join(local, 'studio_app'))) {
      if (/^app-/.test(app)) roots.push({ where: `Studio ${app}`, dir: join(local, 'studio_app', app, 'resources', 'php-bin'), app });
    }
  }
  roots.push({ where: 'Studio ~/.studio', dir: join(homedir(), '.studio', 'php-bin'), app: null });
  for (const r of roots) {
    if (!existsSync(r.dir)) continue;
    for (const d of readdirSync(r.dir)) {
      const v = (/^(\d+\.\d+\.\d+)/.exec(d) || [])[1];
      if (v) found.push({ where: r.where, version: v, app: r.app, path: join(r.dir, d) });
    }
  }
  for (const x of ['C:\\xampp\\php\\php.exe', 'C:\\laragon\\bin\\php', 'C:\\wamp64\\bin\\php']) {
    if (existsSync(x)) found.push({ where: x, version: null, app: null, path: x });
  }
  return found;
}

function phpOnPath() {
  try {
    const out = execFileSync('php', ['-v'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000 });
    return (/PHP (\d+\.\d+\.\d+)/.exec(out) || [])[1] || null;
  } catch {
    return null;
  }
}

async function checkProduction(results) {
  try {
    const res = await fetch(PROD_ORIGIN, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(15000) });
    const powered = res.headers.get('x-powered-by') || '';
    const server = res.headers.get('server') || '';
    if (/php/i.test(powered) || /php|apache|litespeed/i.test(server)) {
      results.push(['FAIL', 'production', `fingerprint PHP/Apache détecté (server=${server || '-'}, x-powered-by=${powered || '-'})`]);
    } else {
      results.push(['OK', 'production', `HTTP ${res.status}, server=${server || '-'}, pas de X-Powered-By`]);
    }
    for (const path of ['/index.php', '/wp-login.php']) {
      const r = await fetch(PROD_ORIGIN + path, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(15000) });
      if (r.status >= 200 && r.status < 300) {
        results.push(['WARN', 'production', `${path} répond ${r.status} — à vérifier (fallback SPA ou vrai PHP ?)`]);
      } else {
        results.push(['OK', 'production', `${path} -> ${r.status}`]);
      }
    }
  } catch (e) {
    results.push(['WARN', 'production', `contrôle impossible (${e.name}) — relancer avec accès réseau`]);
  }
}

export async function run({ root = process.cwd(), ci = false, offline = false } = {}) {
  const results = []; // [level, area, message]

  // 1. PHP files in what we deploy
  const php = findPhpFiles(root);
  if (php.length) php.forEach((f) => results.push(['FAIL', 'fichiers', `fichier PHP dans l'arbre déployé : ${f}`]));
  else results.push(['OK', 'fichiers', 'aucun fichier PHP dans public/ ni dist/']);
  const tracked = trackedPhpFiles(root);
  if (tracked === null) results.push(['OK', 'fichiers', 'git indisponible — contrôle des fichiers suivis ignoré']);
  else if (tracked.length) tracked.forEach((f) => results.push(['FAIL', 'fichiers', `fichier PHP suivi par git : ${f}`]));
  else results.push(['OK', 'fichiers', 'aucun fichier PHP suivi par git']);

  // 4. CSP stays Report-Only
  const hp = join(root, 'public', '_headers');
  if (existsSync(hp)) {
    const enforcing = findEnforcingCsp(readFileSync(hp, 'utf8'));
    if (enforcing.length) results.push(['FAIL', 'csp', 'Content-Security-Policy bloquante dans _headers (attendu : Report-Only)']);
    else results.push(['OK', 'csp', 'aucune CSP bloquante dans _headers']);
  }

  if (!ci) {
    // 2. production fingerprint
    if (!offline) await checkProduction(results);

    // 3. PHP runtimes on this machine
    const runtimes = machinePhpRuntimes();
    const latestApp = runtimes.filter((r) => r.app).map((r) => r.app).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).pop();
    for (const r of runtimes) {
      if (!r.version) {
        results.push(['WARN', 'machine', `${r.where} présent — version non lue, à contrôler à la main`]);
        continue;
      }
      const st = classifyPhp(r.version);
      const active = !r.app || r.app === latestApp;
      const label = `${r.where} : PHP ${r.version}`;
      if (st === 'fixed') results.push(['OK', 'machine', `${label} (corrigé)`]);
      else results.push([active ? 'FAIL' : 'WARN', 'machine', `${label} (${st === 'exposed' ? 'EXPOSÉ' : st})${active ? '' : ' — ancienne installation, à nettoyer'}`]);
    }
    if (!runtimes.length) results.push(['OK', 'machine', 'aucun runtime PHP Studio/XAMPP détecté']);
    const onPath = phpOnPath();
    if (onPath) {
      const st = classifyPhp(onPath);
      results.push([st === 'fixed' ? 'OK' : 'FAIL', 'machine', `php (PATH) : ${onPath} (${st})`]);
    }
  }
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const results = await run({ ci: args.includes('--ci'), offline: args.includes('--offline') });
  for (const [lvl, area, msg] of results) console.log(`${lvl.padEnd(4)} [${area}] ${msg}`);
  const fails = results.filter((r) => r[0] === 'FAIL').length;
  const warns = results.filter((r) => r[0] === 'WARN').length;
  console.log(`\nversions corrigées de référence : ${Object.values(FIXED_PHP).join(', ')}`);
  console.log(fails ? `ÉCHEC : ${fails} point(s) à corriger, ${warns} avertissement(s).` : `OK : aucun échec, ${warns} avertissement(s).`);
  process.exit(fails ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
