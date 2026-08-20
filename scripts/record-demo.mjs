#!/usr/bin/env node
// Records before.gif / after.gif / demo.gif with Playwright (video) + ffmpeg.
// Terminal segments replay the REAL output of `npm run build` / `npm test` captured at record time.
// Usage: NODE_PATH=$(npm root -g) node scripts/record-demo.mjs   (needs playwright + chromium; ffmpeg path below)
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'scripts', 'out');
// Needs a full ffmpeg build (concat demuxer + palettegen/paletteuse + gif encoder), e.g. `npm i ffmpeg-static`
// and FFMPEG=$(node -p "require('ffmpeg-static')"). Playwright's bundled ffmpeg is too minimal for GIFs.
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
const GIF_ONLY = process.argv.includes('--gif-only'); // reuse scripts/out/*.webm from a previous run
const W = 1000;
const H = 625;
const BEFORE_PORT = 8080;
const AFTER_PORT = 4173;

if (!GIF_ONLY) fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } });
  // strip any ANSI colour codes that slip through
  return { code: r.status, text: `${r.stdout ?? ''}${r.stderr ?? ''}`.replace(/\x1b\[[0-9;]*m/g, '') };
};

const seg = (name) => path.join(out, `${name}.webm`);
if (!GIF_ONLY) await record();

async function record() {
// ---------- 1. capture real terminal output ----------
console.log('capturing terminal output…');
const beforeBuild = run('npm', ['run', 'build'], path.join(root, 'before'));
const afterBuild = run('npm', ['run', 'build'], path.join(root, 'after'));
const afterTest = run('npm', ['test'], path.join(root, 'after'));
if (beforeBuild.code === 0) throw new Error('before/ build unexpectedly passed');
if (afterBuild.code !== 0 || afterTest.code !== 0) throw new Error('after/ build or tests failed');

const keep = (text, re) => text.split('\n').filter((l) => re.test(l)).map((l) => l.trimEnd());
const beforeLines = keep(beforeBuild.text, /error TS|^> /).slice(0, 9);
const afterBuildLines = keep(afterBuild.text, /^> |vite v|modules transformed|dist\/|built in/);
const afterTestLines = keep(afterTest.text, /✓ src|Test Files|Tests /);

// ---------- 2. helpers ----------
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const color = (line) => {
  if (/error TS|exit code [1-9]/.test(line)) return `<span class="red">${esc(line)}</span>`;
  if (/✓|passed|exit code 0/.test(line)) return `<span class="green">${esc(line)}</span>`;
  if (/^> /.test(line)) return `<span class="dim">${esc(line)}</span>`;
  return esc(line);
};
const terminalHtml = (title, badgeClass) => `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:#0b1120;font-family:'Ubuntu Mono','DejaVu Sans Mono',monospace;color:#e2e8f0}
.bar{height:34px;background:#1e293b;display:flex;align-items:center;gap:8px;padding:0 14px;font:13px 'Ubuntu Sans',system-ui,sans-serif;color:#94a3b8}
.dot{width:12px;height:12px;border-radius:50%;background:#475569}.dot.r{background:#ef4444}.dot.y{background:#f59e0b}.dot.g{background:#22c55e}
.badge{margin-left:auto;font-weight:700;font-size:12px;letter-spacing:.08em;padding:3px 10px;border-radius:999px;color:#fff}
.badge.before{background:#dc2626}.badge.after{background:#16a34a}
pre{margin:0;padding:18px 22px;font-size:17px;line-height:1.5;white-space:pre-wrap;word-break:break-word}
.red{color:#fb7185}.green{color:#4ade80}.dim{color:#94a3b8}.prompt{color:#a5b4fc;font-weight:700}
.cursor{display:inline-block;width:9px;height:19px;background:#e2e8f0;vertical-align:-3px;animation:b 1s steps(1) infinite}@keyframes b{50%{opacity:0}}
</style></head><body><div class="bar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>${title}
<span class="badge ${badgeClass}">${badgeClass.toUpperCase()}</span></div><pre id="t"></pre></body></html>`;

async function typeCommand(page, cmd) {
  await page.evaluate(() => {
    const t = document.getElementById('t');
    t.insertAdjacentHTML('beforeend', '<span class="prompt">$ </span><span class="cmd"></span><span class="cursor"></span>');
  });
  for (const ch of cmd) {
    await page.evaluate((c) => {
      const cmds = document.querySelectorAll('.cmd');
      cmds[cmds.length - 1].textContent += c;
    }, ch);
    await sleep(22);
  }
  await sleep(200);
  await page.evaluate(() => {
    document.querySelector('.cursor')?.remove();
    document.getElementById('t').insertAdjacentHTML('beforeend', '\n');
  });
}
async function printLines(page, lines, delay = 70) {
  for (const line of lines) {
    await page.evaluate((html) => document.getElementById('t').insertAdjacentHTML('beforeend', html + '\n'), color(line));
    await sleep(delay);
  }
}

// Fake address bar + caption, injected into app pages (the recording has no browser chrome).
const overlayScript = (badge, text) => `(() => {
  const b = document.body; b.style.paddingTop = '40px';
  const bar = document.createElement('div'); bar.id = '__addr';
  bar.style.cssText = 'position:fixed;top:0;left:0;right:0;height:40px;background:#1e293b;color:#e2e8f0;display:flex;align-items:center;gap:10px;padding:0 14px;font:14px Ubuntu Mono,DejaVu Sans Mono,monospace;z-index:99999;box-sizing:border-box';
  const badgeEl = document.createElement('span'); badgeEl.textContent = '${badge}';
  badgeEl.style.cssText = 'font:700 11px Ubuntu Sans,system-ui,sans-serif;letter-spacing:.08em;padding:3px 10px;border-radius:999px;color:#fff;background:${badge === 'BEFORE' ? '#dc2626' : '#16a34a'}';
  const url = document.createElement('span'); url.id = '__url';
  url.style.cssText = 'background:#0f172a;border-radius:6px;padding:5px 10px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
  bar.append(badgeEl, url); document.documentElement.appendChild(bar);
  const cap = document.createElement('div'); cap.id = '__cap';
  cap.style.cssText = 'position:fixed;left:0;right:0;bottom:0;background:rgba(15,23,42,.92);color:#fff;font:500 17px/1.35 Ubuntu Sans,system-ui,sans-serif;padding:12px 18px;z-index:99999;box-sizing:border-box';
  cap.textContent = ${JSON.stringify(text)}; document.documentElement.appendChild(cap);
  const tick = () => { url.textContent = location.href.replace(/^http:\\/\\//, ''); }; tick(); setInterval(tick, 100);
})();`;
const overlay = (page, badge, text) => page.evaluate(overlayScript(badge, text));
const caption = (page, text) => page.evaluate((t) => { const c = document.getElementById('__cap'); if (c) c.textContent = t; }, text);

async function typeInto(page, selector, text) {
  await page.click(selector);
  await page.type(selector, text, { delay: 30 });
}

async function segment(browser, name, fn) {
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    recordVideo: { dir: out, size: { width: W, height: H } },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await fn(page, context);
  const video = page.video();
  await context.close();
  const file = path.join(out, `${name}.webm`);
  fs.renameSync(await video.path(), file);
  console.log('recorded', name);
  return file;
}

async function waitForPort(port, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      await fetch(`http://localhost:${port}/`);
      return;
    } catch {
      await sleep(250);
    }
  }
  throw new Error(`port ${port} did not open`);
}

// ---------- 3. servers ----------
console.log('starting servers…');
const beforeDev = spawn('npx', ['vite', '--port', String(BEFORE_PORT), '--strictPort'], {
  cwd: path.join(root, 'before'),
  stdio: 'ignore',
});
const afterStatic = spawn('node', [path.join(root, 'scripts/serve-static.mjs'), path.join(root, 'after/dist'), String(AFTER_PORT)], {
  stdio: 'ignore',
});
const cleanup = () => {
  beforeDev.kill();
  afterStatic.kill();
};
process.on('exit', cleanup);
await waitForPort(BEFORE_PORT);
await waitForPort(AFTER_PORT);

// ---------- 4. record ----------
const browser = await chromium.launch();

const segBeforeTerminal = await segment(browser, '1-before-terminal', async (page) => {
  await page.setContent(terminalHtml('before — bash', 'before'));
  await sleep(200);
  await typeCommand(page, 'npm run build');
  await printLines(page, beforeLines, 100);
  await printLines(page, [`✖ exit code ${beforeBuild.code} — Vercel build fails the same way`], 0);
  await sleep(1200);
});

const segBeforeBrowser = await segment(browser, '2-before-browser', async (page) => {
  // Supabase host is a fake placeholder; delay the failure a little so the sequence is visible on video.
  await page.route('**/xxxx.supabase.co/**', async (route) => {
    await sleep(900);
    await route.abort('failed');
  });
  await page.goto(`http://localhost:${BEFORE_PORT}/login`);
  await overlay(page, 'BEFORE', 'Sign in… and land right back on /login (login loop — sign-in result ignored, guard has no loading state)');
  await sleep(400);
  await typeInto(page, '#email', 'ana@example.com');
  await typeInto(page, '#password', 'secret123');
  await sleep(150);
  await page.click('button[type=submit]');
  await sleep(1600);
  await page.goto(`http://localhost:${BEFORE_PORT}/tasks/42`);
  await overlay(page, 'BEFORE', '/tasks/42 opens WITHOUT signing in (route not protected)…');
  await sleep(1100);
  await caption(page, '…then the failed query sets null state → render crash → white screen (no error boundary)');
  await sleep(1500);
});

const segAfterTerminal = await segment(browser, '3-after-terminal', async (page) => {
  await page.setContent(terminalHtml('after — bash', 'after'));
  await sleep(200);
  await typeCommand(page, 'npm run build && npm test');
  await printLines(page, afterBuildLines.slice(0, 8), 55);
  await printLines(page, afterTestLines, 90);
  await printLines(page, ['✔ exit code 0 — build passes, 5 tests green'], 0);
  await sleep(1200);
});

const segAfterBrowser = await segment(browser, '4-after-browser', async (page) => {
  await page.goto(`http://localhost:${AFTER_PORT}/login`);
  await overlay(page, 'AFTER', 'Demo mode (no Supabase env) — honest banner; real sign-in errors are shown, not swallowed');
  await sleep(500);
  await typeInto(page, '#email', 'ana@example.com');
  await typeInto(page, '#password', 'secret123');
  await page.click('button[type=submit]');
  await page.waitForSelector('.task-list');
  await caption(page, 'Signed in → /tasks: protected route, one paginated query (no N+1)');
  await sleep(1000);
  await typeInto(page, 'input[aria-label="New task"]', 'Ship v1 to production');
  await page.click('button[type=submit]');
  await page.waitForSelector('text=Ship v1 to production');
  await caption(page, 'New task created');
  await sleep(700);
  await page.click('text=Ship v1 to production');
  await page.waitForSelector('h1:has-text("Ship v1 to production")');
  await caption(page, 'Deep link /tasks/:id — now hard-refresh…');
  await sleep(900);
  await page.reload();
  await page.waitForSelector('h1:has-text("Ship v1 to production")');
  await overlay(page, 'AFTER', 'Refresh on a nested route → 200, still signed in (vercel.json rewrites + session restore)');
  await sleep(1700);
});

await browser.close();
cleanup();
}

// ---------- 5. ffmpeg → gif ----------
function gif(files, target, fps = 10, width = W) {
  const list = path.join(out, `${path.basename(target)}.txt`);
  fs.writeFileSync(list, files.map((f) => `file '${f}'`).join('\n'));
  // 5% faster keeps the combined GIF under 20 s without cutting any step
  const vf = `setpts=PTS/1.05,fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`;
  const r = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-vf', vf, '-loop', '0', target], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
  console.log(target, (fs.statSync(target).size / 1024 / 1024).toFixed(2), 'MB');
}
const segs = ['1-before-terminal', '2-before-browser', '3-after-terminal', '4-after-browser'].map(seg);
gif(segs.slice(0, 2), path.join(root, 'before.gif'));
gif(segs.slice(2), path.join(root, 'after.gif'));
gif(segs, path.join(root, 'demo.gif'));
