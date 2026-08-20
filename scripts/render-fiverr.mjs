#!/usr/bin/env node
// Renders the two Fiverr portfolio images (exactly 1280×769 PNG) from an HTML template.
// Usage: NODE_PATH=$(npm root -g) node scripts/render-fiverr.mjs   (needs playwright + chromium)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'fiverr');
const tplDir = path.join(outDir, 'templates');
fs.mkdirSync(tplDir, { recursive: true });

const cases = [
  {
    file: 'case-1-lovable-before-after',
    title: 'Lovable app → production in 48h',
    subtitle: 'A vibe-coded React + Supabase task tracker that would not build or deploy — fixed, tested, deploy-ready.',
    before: [
      '<code>npm run build</code> fails — 4 TypeScript errors',
      'Supabase URL + keys hardcoded, <code>.env</code> committed to git',
      'Login loop: sign in → straight back to /login',
      '<code>/tasks/:id</code> opens without signing in',
      '404 on refresh of any deep link (no rewrites)',
      'White screen on API errors — no error boundary',
    ],
    after: [
      'Build green + CI (GitHub Actions: build + tests)',
      'Secrets in env vars, <code>.env.example</code>, <code>.gitignore</code>',
      'Auth waits for the session; redirect back after login',
      'Every app route behind one protected layout',
      '<code>vercel.json</code> + <code>netlify.toml</code> SPA rewrites',
      'Error boundary + readable error messages',
    ],
    metrics: [
      ['Build', 'failing', 'passing'],
      ['Secrets', 'in repo', 'env vars'],
      ['Deep-link refresh', '404', '200'],
    ],
  },
  {
    file: 'case-2-supabase-auth-deploy',
    title: 'Supabase login loop + Vercel deploy — fixed',
    subtitle: 'Auth that kept sending users back to /login, and a build that died on Vercel — diagnosed and fixed end to end.',
    before: [
      'Sign in → bounced to /login; logged out on refresh',
      'OAuth redirect URL points at the Lovable preview',
      'Sign-in errors swallowed — nothing shown to the user',
      'Vercel: <code>"npm run build" exited with 2</code>',
      'Every refresh on <code>/tasks/:id</code> → 404',
      'Edge function: no CORS, no error handling',
    ],
    after: [
      'Session restored before guarding — no bounce',
      'Redirect to current origin; Site URL + redirects set',
      'Sign-in errors shown; redirect back after login',
      'Type errors fixed; build + 5 tests green in CI',
      'SPA rewrites (Vercel / Netlify): deep links work',
      'Edge function: CORS, preflight, JSON errors',
    ],
    metrics: [
      ['Login loop', 'bouncing', 'fixed'],
      ['Vercel build', 'exit 2', 'exit 0'],
      ['Refresh on deep link', '404', '200'],
    ],
  },
];

const item = (text, ok) => `<li><span class="ic ${ok ? 'ok' : 'no'}">${ok ? '✓' : '✕'}</span><span>${text}</span></li>`;
const metric = ([label, from, to]) =>
  `<div class="m"><div class="ml">${label}</div><div class="mv"><span class="from">${from}</span><span class="arr">→</span><span class="to">${to}</span></div></div>`;

const html = (c) => `<!doctype html><html><head><meta charset="utf-8"><title>${c.title}</title><style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1280px;height:769px;overflow:hidden}
body{font-family:'Ubuntu Sans','Ubuntu','Segoe UI',system-ui,sans-serif;color:#0f172a;background:linear-gradient(135deg,#f8fafc 0%,#eef2ff 100%);padding:38px 44px;display:flex;flex-direction:column;gap:22px}
code{font-family:'Ubuntu Mono','DejaVu Sans Mono',monospace;font-size:.92em;background:#f1f5f9;padding:1px 6px;border-radius:6px}
.head{display:flex;align-items:flex-start;justify-content:space-between;gap:24px}
h1{font-size:46px;font-weight:800;letter-spacing:-.02em;line-height:1.1}
.sub{font-size:21px;color:#475569;margin-top:10px;max-width:900px;line-height:1.35}
.pill{flex:none;margin-top:6px;background:#0f172a;color:#fff;font-weight:700;font-size:16px;padding:10px 18px;border-radius:999px;letter-spacing:.01em}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:28px;flex:1;min-height:0}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:22px 26px;display:flex;flex-direction:column;box-shadow:0 10px 30px rgba(15,23,42,.06)}
.card.before{border-top:6px solid #dc2626}.card.after{border-top:6px solid #16a34a}
.ch{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.badge{font-size:15px;font-weight:800;letter-spacing:.12em;padding:6px 14px;border-radius:999px;color:#fff}
.before .badge{background:#dc2626}.after .badge{background:#16a34a}
.ch span.l{font-size:17px;color:#64748b}
ul{list-style:none;display:flex;flex-direction:column;gap:11px}
li{display:flex;align-items:flex-start;gap:12px;font-size:20.5px;line-height:1.3;font-weight:500}
.ic{flex:none;width:30px;height:30px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:17px;margin-top:-1px}
.ic.no{background:#fee2e2;color:#dc2626}.ic.ok{background:#dcfce7;color:#16a34a}
.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.m{background:#0f172a;color:#fff;border-radius:14px;padding:14px 20px}
.ml{font-size:14px;letter-spacing:.1em;text-transform:uppercase;color:#94a3b8;font-weight:700}
.mv{display:flex;align-items:center;gap:12px;font-size:26px;font-weight:800;margin-top:4px}
.from{color:#fca5a5;text-decoration:line-through;text-decoration-thickness:3px}.arr{color:#64748b}.to{color:#86efac}
.foot{flex:none;display:flex;justify-content:space-between;font-size:15px;color:#64748b}
</style></head><body>
<div class="head"><div><h1>${c.title}</h1><p class="sub">${c.subtitle}</p></div><div class="pill">48h · fixed price · async</div></div>
<div class="cols">
  <div class="card before"><div class="ch"><span class="badge">BEFORE</span><span class="l">as handed over by the AI builder</span></div><ul>${c.before.map((t) => item(t, false)).join('')}</ul></div>
  <div class="card after"><div class="ch"><span class="badge">AFTER</span><span class="l">production-ready, with a written handover</span></div><ul>${c.after.map((t) => item(t, true)).join('')}</ul></div>
</div>
<div class="metrics">${c.metrics.map(metric).join('')}</div>
<div class="foot"><span>Demo case: TaskFlow — a Lovable-style React + Supabase app (code on GitHub, before/ and after/)</span><span>Lovable · Bolt · v0 · Cursor · Replit + Supabase</span></div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 769 }, deviceScaleFactor: 1 });
for (const c of cases) {
  const tpl = path.join(tplDir, `${c.file}.html`);
  fs.writeFileSync(tpl, html(c));
  await page.setContent(html(c), { waitUntil: 'load' });
  const png = path.join(outDir, `${c.file}.png`);
  await page.screenshot({ path: png, type: 'png' });
  const buf = fs.readFileSync(png);
  console.log(png, `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`, `${(buf.length / 1024).toFixed(0)} KB`);
}
await browser.close();
