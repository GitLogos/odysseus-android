#!/usr/bin/env node
// scripts/sync-upstream.mjs — pull the web UI from the upstream odysseus repo
// and stage it for Capacitor.
//
//   npm run sync:upstream
//   node scripts/sync-upstream.mjs --ref v1.2.3
//   node scripts/sync-upstream.mjs --local /path/to/odysseus   # dev loop, no network
//   UPSTREAM_REPO=... UPSTREAM_REF=... STRICT=1 node scripts/sync-upstream.mjs
//
// What it does:
//   1. Resolves the upstream ref (flag > env > upstream.ref file, default `dev`).
//   2. Fetches ONLY the needed paths via a shallow sparse clone
//      (`static/`, plus `core/middleware.py` + `app.py` for the server-support
//      check) into a temp dir — fast even on big repos. `--local` copies from
//      a local checkout instead (no network).
//   3. Rebuilds `www/` from scratch (idempotent): mirrors the server URL space
//      (index.html at root, everything else under static/), copies the local
//      `overlay/` Capacitor shims in, patches index.html/login.html with
//      idempotency markers, writes a `.upstream.json` provenance stamp.
//   4. Verifies the pinned upstream contains the server-side support the app
//      needs (CSP `connect-src` + CORS origins for the Capacitor WebView).
//      Warns by default, fails with `--strict` / `STRICT=1`.
//
// Upstream stays pristine: ZERO web-file changes are required in
// odysseus-dev/odysseus for the app to build. The only upstream requirement
// is the two server-side one-liners (see README "Server support"), which the
// support check below enforces.

import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_REPO = 'https://github.com/odysseus-dev/odysseus.git';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}
function flag(name) {
  return process.argv.includes(name);
}
function readRefFile() {
  try {
    return readFileSync(join(ROOT, 'upstream.ref'), 'utf8').trim().split(/\s+/)[0] || 'dev';
  } catch {
    return 'dev';
  }
}

const REPO = process.env.UPSTREAM_REPO || DEFAULT_REPO;
const REF = arg('--ref') || process.env.UPSTREAM_REF || readRefFile();
const LOCAL = arg('--local') || process.env.UPSTREAM_LOCAL || null;
const STAGING = resolve(ROOT, process.env.STAGING_DIR || 'www');
const OVERLAY = resolve(ROOT, 'overlay');
const STRICT = flag('--strict') || process.env.STRICT === '1';
const IS_SHA = /^[0-9a-f]{7,40}$/i.test(REF);

function git(args, cwd) {
  return execFileSync('git', args, { cwd: cwd || ROOT, stdio: 'pipe', encoding: 'utf8' }).trim();
}

function fetchUpstream() {
  if (LOCAL) {
    const src = resolve(LOCAL);
    if (!existsSync(join(src, 'static', 'index.html'))) {
      throw new Error(`--local ${src} does not look like an odysseus checkout (static/index.html missing)`);
    }
    console.log(`Using local upstream checkout: ${src}`);
    return { dir: src, sha: safeSha(src), ephemeral: false };
  }
  const tmp = mkdtempSync(join(tmpdir(), 'ody-upstream-'));
  console.log(`Cloning ${REPO} @ ${REF} (shallow sparse: static/, server markers only)…`);
  try {
    if (IS_SHA) {
      // --branch does not accept a raw SHA: clone the default branch, then
      // fetch + check out the exact commit.
      try {
        git(['clone', '--depth', '1', '--filter=blob:none', '--sparse', REPO, tmp]);
      } catch {
        git(['clone', '--depth', '1', '--sparse', REPO, tmp]);
      }
      git(['sparse-checkout', 'set', '--no-cone', 'static/', 'core/middleware.py', 'app.py'], tmp);
      git(['fetch', '--depth', '1', 'origin', REF], tmp);
      git(['checkout', REF], tmp);
    } else {
      // Works for branches AND tags.
      try {
        git(['clone', '--depth', '1', '--branch', REF, '--filter=blob:none', '--sparse', REPO, tmp]);
      } catch {
        git(['clone', '--depth', '1', '--branch', REF, '--sparse', REPO, tmp]);
      }
      git(['sparse-checkout', 'set', '--no-cone', 'static/', 'core/middleware.py', 'app.py'], tmp);
    }
  } catch (e) {
    rmSync(tmp, { recursive: true, force: true });
    throw new Error(`Failed to fetch upstream @ ${REF}: ${(e && e.message) || e}`);
  }
  return { dir: tmp, sha: safeSha(tmp), ephemeral: true };
}

function safeSha(dir) {
  try {
    return git(['rev-parse', 'HEAD'], dir);
  } catch {
    return 'unknown';
  }
}

// ---------- HTML patching (idempotent via markers) ----------

const BOOT_MARK = 'capacitor-overlay:boot';

const BOOT_TAG_INDEX =
  `<!-- ${BOOT_MARK} -->\n` + `  <script src="/static/js/capacitor-boot.js"></script>`;
// NOTE: no CSP nonce here. The staged copy runs inside the app where no CSP
// header is served, so a bare script tag is correct (and required — there is
// no server to inject a nonce at runtime).

const SW_GUARDED =
  `<script>if('serviceWorker' in navigator && !window.__odysseusCapacitorNative){navigator.serviceWorker.register('/static/sw.js').catch(()=>{});}</script>`;

const INIT_MODULE = `<!-- capacitor-overlay:native-init -->\n` + `<script type="module">
  // Capacitor native wiring (no-op in browsers): server onboarding sheet when
  // no backend is configured yet, plus StatusBar/Splash/Keyboard polish.
  (async () => {
    try {
      if (!window.__odysseusCapacitorNative) return;
      const [{ maybeShowOnBoot }, { initNativeUi }] = await Promise.all([
        import('/static/js/capacitor-onboarding.js'),
        import('/static/js/capacitor-native.js'),
      ]);
      try { maybeShowOnBoot(); } catch (_) {}
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => initNativeUi().catch(() => {}), { once: true });
      } else {
        initNativeUi().catch(() => {});
      }
    } catch (_) {}
  })();
</script>`;

function insertAfterAnchor(html, anchorSubstrings, insert) {
  for (const a of anchorSubstrings) {
    const i = html.indexOf(a);
    if (i !== -1) {
      const eol = html.indexOf('\n', i);
      const at = eol === -1 ? html.length : eol + 1;
      return html.slice(0, at) + insert + '\n' + html.slice(at);
    }
  }
  return null;
}

function patchIndex(html, label) {
  let out = html;
  let changed = false;
  // Content-based detection (not just our marker): an upstream that already
  // integrates the Capacitor boot (e.g. a monorepo checkout) is left alone —
  // no duplicate script tags. The marker is still written on fresh inserts
  // for traceability.
  if (!/capacitor-boot\.js/.test(out)) {
    const withBoot = insertAfterAnchor(
      out,
      ['<link rel="apple-touch-icon" href="/static/icons/icon-192.png">'],
      BOOT_TAG_INDEX
    );
    // Fallback: park it right before </head> if upstream reshuffles head tags.
    out = withBoot !== null ? withBoot : out.replace('</head>', `${BOOT_TAG_INDEX}\n</head>`);
    changed = true;
  }
  // Guard the stock service-worker registration (upstream may reword it, so
  // match loosely; if it no longer matches, the guard is appended once).
  const swRe = /<script[^>]*>\s*if\s*\(\s*'serviceWorker'\s*in\s*navigator\s*\)\s*\{\s*navigator\.serviceWorker\.register\([^)]*\)[^<]*<\/script>/;
  if (!out.includes('__odysseusCapacitorNative){navigator.serviceWorker.register')) {
    if (swRe.test(out)) out = out.replace(swRe, SW_GUARDED);
    else out = out.replace('</body>', `${SW_GUARDED}\n</body>`);
    changed = true;
  }
  if (!/capacitor-onboarding\.js/.test(out)) {
    out = out.includes('</body>')
      ? out.replace('</body>', `${INIT_MODULE}\n</body>`)
      : out + '\n' + INIT_MODULE + '\n';
    changed = true;
  }
  if (changed) console.log(`  patched ${label}`);
  else console.log(`  ${label} already integrated (no changes needed)`);
  return out;
}

function patchLogin(html, label) {
  let out = html;
  if (!/capacitor-boot\.js/.test(out)) {
    const tag = `<!-- ${BOOT_MARK} -->\n<script src="static/js/capacitor-boot.js"></script>`;
    const withBoot = insertAfterAnchor(
      out,
      ['<link rel="apple-touch-icon" href="static/icons/icon-192.png">'],
      tag
    );
    out = withBoot !== null ? withBoot : out.replace('</head>', `${tag}\n</head>`);
    console.log(`  patched ${label}`);
  } else {
    console.log(`  ${label} already integrated (no changes needed)`);
  }
  return out;
}

// ---------- server-support check ----------

function checkServerSupport(checkoutDir) {
  const missing = [];
  try {
    const mw = readFileSync(join(checkoutDir, 'core', 'middleware.py'), 'utf8');
    if (!mw.includes('capacitor:')) missing.push('core/middleware.py lacks the Capacitor connect-src allowance');
  } catch {
    missing.push('core/middleware.py not found in fetched upstream');
  }
  try {
    const app = readFileSync(join(checkoutDir, 'app.py'), 'utf8');
    if (!app.includes('capacitor://localhost')) missing.push('app.py ALLOWED_ORIGINS lacks Capacitor origins');
  } catch {
    missing.push('app.py not found in fetched upstream');
  }
  if (missing.length === 0) {
    console.log('Server support check: OK (upstream allows the Capacitor WebView origin).');
    return;
  }
  const msg =
    `Server support check FAILED for upstream @ ${REF}:\n` +
    missing.map((m) => `  - ${m}`).join('\n') +
    '\nWithout these, the app\'s remote /api/* calls are CSP/CORS-blocked.' +
    ' Pin UPSTREAM_REF to a release containing them, or merge them upstream (see README).';
  if (STRICT) throw new Error(msg);
  console.warn('WARNING: ' + msg);
}

// ---------- main ----------

function main() {
  console.log(`odysseus-android sync\n  repo: ${LOCAL ? '(local) ' + resolve(LOCAL) : REPO}\n  ref:  ${REF}`);
  const { dir, sha, ephemeral } = fetchUpstream();
  try {
    checkServerSupport(dir);

    const srcStatic = join(dir, 'static');
    if (!existsSync(join(srcStatic, 'index.html'))) {
      throw new Error(`Upstream @ ${REF} has no static/index.html — refusing to stage.`);
    }

    console.log(`Staging web bundle -> ${STAGING} (clean rebuild)…`);
    rmSync(STAGING, { recursive: true, force: true });
    mkdirSync(join(STAGING, 'static'), { recursive: true });

    // Mirror the server URL space: index at root, assets under static/.
    cpSync(srcStatic, join(STAGING, 'static'), { recursive: true });
    cpSync(join(srcStatic, 'index.html'), join(STAGING, 'index.html'));
    cpSync(join(srcStatic, 'login.html'), join(STAGING, 'login.html'));
    mkdirSync(join(STAGING, 'login'), { recursive: true });
    cpSync(join(srcStatic, 'login.html'), join(STAGING, 'login', 'index.html'));

    // Overlay the Capacitor shims (this repo owns them; upstream is untouched).
    const overlayJs = join(OVERLAY, 'static', 'js');
    if (!existsSync(overlayJs)) throw new Error(`overlay dir missing: ${overlayJs}`);
    cpSync(overlayJs, join(STAGING, 'static', 'js'), { recursive: true });

    // Patch the STAGED copies (never the upstream checkout).
    for (const [file, fn] of [
      ['index.html', patchIndex],
      ['login.html', patchLogin],
      [join('login', 'index.html'), patchLogin],
    ]) {
      const p = join(STAGING, file);
      writeFileSync(p, fn(readFileSync(p, 'utf8'), file));
    }

    const stamp = {
      repo: LOCAL ? resolve(LOCAL) : REPO,
      ref: REF,
      sha,
      syncedAt: new Date().toISOString(),
    };
    writeFileSync(join(STAGING, '.upstream.json'), JSON.stringify(stamp, null, 2) + '\n');
    console.log(`Done. Upstream ${REF} @ ${sha.slice(0, 12)} staged to ${STAGING}`);
    console.log('Next: npx cap sync android   (or: npm run mobile:sync)');
  } finally {
    if (ephemeral) rmSync(dir, { recursive: true, force: true });
  }
}

try {
  main();
} catch (e) {
  console.error(`sync-upstream FAILED: ${(e && e.message) || e}`);
  process.exit(1);
}
