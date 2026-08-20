#!/usr/bin/env node
// Minimal static host that behaves like Vercel/Netlify with regard to the "404 on refresh" problem:
// it serves files from a build folder and returns 404 for unknown paths — unless the project next to the
// folder has a vercel.json with a rewrite to /index.html, in which case the SPA entry is served instead.
// Usage: node scripts/serve-static.mjs <dist-dir> [port]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const dir = path.resolve(process.argv[2] ?? 'dist');
const port = Number(process.argv[3] ?? 4173);
const projectDir = path.dirname(dir);

let spaFallback = false;
try {
  const vercel = JSON.parse(fs.readFileSync(path.join(projectDir, 'vercel.json'), 'utf8'));
  spaFallback = (vercel.rewrites ?? []).some((r) => r.destination === '/index.html');
} catch {
  /* no vercel.json → behave like a plain static host */
}

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};

const notFoundPage = `<!doctype html><html><head><meta charset="utf-8"><title>404: NOT_FOUND</title>
<style>body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;color:#000;background:#fff}
.w{display:flex;align-items:center;gap:20px}.c{font-size:24px;font-weight:500;padding-right:20px;border-right:1px solid #ccc}.m{font-size:14px}</style></head>
<body><div class="w"><div class="c">404</div><div class="m">This page could not be found.<br><small>Code: <code>NOT_FOUND</code> — the host has no file for this path and no SPA rewrite rule.</small></div></div></body></html>`;

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let file = path.normalize(path.join(dir, decodeURIComponent(url.pathname)));
    if (!file.startsWith(dir)) {
      res.writeHead(403);
      return res.end();
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      if (!spaFallback) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(notFoundPage);
      }
      file = path.join(dir, 'index.html');
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, () => {
    console.log(
      `Serving ${dir} on http://localhost:${port} — SPA fallback ${
        spaFallback ? 'ON (vercel.json rewrite found)' : 'OFF (no vercel.json rewrite → deep links 404)'
      }`,
    );
  });
