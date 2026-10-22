import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyPhp, findPhpFiles, findEnforcingCsp, run, FIXED_PHP } from '../check-php-exposure.mjs';

test('classifyPhp: fixed boundary of each supported branch', () => {
  for (const [branch, fixed] of Object.entries(FIXED_PHP)) {
    const [maj, min, patch] = fixed.split('.').map(Number);
    assert.equal(classifyPhp(fixed), 'fixed', `${fixed} is fixed`);
    assert.equal(classifyPhp(`${maj}.${min}.${patch + 1}`), 'fixed');
    assert.equal(classifyPhp(`${maj}.${min}.${patch - 1}`), 'exposed', `${branch} one patch below is exposed`);
  }
});

test('classifyPhp: Studio versions seen on the machine on 2026-10-22', () => {
  assert.equal(classifyPhp('8.4.24'), 'exposed');
  assert.equal(classifyPhp('8.4.25'), 'exposed');
  assert.equal(classifyPhp('8.4.27'), 'fixed');
});

test('classifyPhp: 8.1 and older are unsupported, garbage is unknown', () => {
  assert.equal(classifyPhp('8.1.30'), 'unsupported');
  assert.equal(classifyPhp('7.4.33'), 'unsupported');
  assert.equal(classifyPhp('not-a-version'), 'unknown');
});

test('findPhpFiles: flags PHP-family files in public/ and dist/, ignores the rest', () => {
  const root = mkdtempSync(join(tmpdir(), 'php-guard-'));
  try {
    mkdirSync(join(root, 'public', 'uploads'), { recursive: true });
    mkdirSync(join(root, 'dist'), { recursive: true });
    writeFileSync(join(root, 'public', 'ok.txt'), 'x');
    writeFileSync(join(root, 'public', 'uploads', 'shell.PHP'), 'x');
    writeFileSync(join(root, 'public', '.htaccess'), 'x');
    writeFileSync(join(root, 'dist', 'a.phtml'), 'x');
    const found = findPhpFiles(root).map((f) => f.replace(root, '').replaceAll('\\', '/'));
    assert.deepEqual(found.sort(), ['/dist/a.phtml', '/public/.htaccess', '/public/uploads/shell.PHP']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('run --ci: fails on a PHP file, passes on a clean tree', async () => {
  const root = mkdtempSync(join(tmpdir(), 'php-guard-'));
  try {
    mkdirSync(join(root, 'public'), { recursive: true });
    writeFileSync(join(root, 'public', 'ok.txt'), 'x');
    assert.equal((await run({ root, ci: true })).some((r) => r[0] === 'FAIL'), false);
    writeFileSync(join(root, 'public', 'x.php'), 'x');
    assert.equal((await run({ root, ci: true })).some((r) => r[0] === 'FAIL'), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('findEnforcingCsp: Report-Only passes, enforcing CSP is caught', () => {
  assert.equal(findEnforcingCsp('/*\n  Content-Security-Policy-Report-Only: default-src \'self\'\n').length, 0);
  assert.equal(findEnforcingCsp('/*\n  Content-Security-Policy: default-src \'self\'\n').length, 1);
});
