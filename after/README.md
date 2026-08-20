# TaskFlow — `after/` (production-ready)

Same app as [`../before/`](../before/), after the production pass. Vite + React + TypeScript, React Router, Supabase JS — no other runtime dependencies.

## Run it

```bash
npm install
npm run dev        # http://localhost:8080 — demo mode (no Supabase needed)
npm run build      # tsc + vite build → dist/
npm test           # vitest (5 tests)
```

**Demo mode.** Without `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` the app runs on `localStorage` and says so in a banner. Any email + a 6-character password signs you in; data stays in your browser. The "Summarize with AI" button returns a canned sentence (no model call).

**Real backend.** Copy `.env.example` → `.env`, fill in the two variables, run `supabase/schema.sql` in your project, deploy `supabase/functions/summarize-task` (set `OPENAI_API_KEY` as a function secret). The Supabase adapter (`src/lib/backend.supabase.ts`) is written against that schema and type-checked, but this public demo has no live project, so it is **not** exercised by the tests or the GIF — treat it as reviewed code, not as verified in production.

## What changed (before → after)

| Area | before | after |
|---|---|---|
| Build | `tsc` fails (unused import, `null` assigned to `Task[]`) | clean `tsc && vite build`; CI runs it on every push |
| Config & secrets | URL + anon key hardcoded in `src/integrations/supabase/client.ts`; `.env` with a *service-role* key committed; `import.meta.env.SUPABASE_URL` (no `VITE_` prefix) → `undefined` | `src/lib/config.ts` reads `VITE_*`, falls back to demo mode; `.env.example`; `.env` git-ignored; **rotate the leaked keys** (see checklist) |
| Auth | guard redirects before the session is loaded → login loop; sign-in result ignored; OAuth `redirectTo` = Lovable preview URL | `AuthProvider` with `loading`; `RequireAuth` waits, then redirects with `state.from`; errors shown; `redirectTo: window.location.origin` |
| Routing | `/tasks/:id` unprotected; no 404 page | all app routes under one protected layout route; `NotFound` |
| Errors | failed query → `null.map()` → white screen | `BackendError` surfaced inline with Retry; root `ErrorBoundary` |
| Data | all tasks at once + one query per task for the author (N+1) | one paginated query with a join, 10 per page, total count |
| Edge function | raw `fetch`, no `res.ok`, function without CORS/OPTIONS | `functions.invoke` with error handling; function returns CORS headers, JSON errors, checks auth + input |
| Deploy | no rewrite rules → 404 on refresh | `vercel.json` + `netlify.toml` |
| Quality | no tests, no CI | Vitest (config + local backend), GitHub Actions |

## Architecture note

`src/lib/types.ts` defines a small `Backend` interface (auth, tasks, ai). `src/lib/backend.ts` picks an implementation at startup:

- `backend.local.ts` — localStorage, seeded with 12 tasks; used in demo mode and in tests (with an in-memory storage).
- `backend.supabase.ts` — supabase-js against `supabase/schema.sql`.

Pages only talk to `backend`, so swapping the data layer (or mocking it) does not touch the UI.

## Deploy checklist (Vercel / Netlify)

1. **Rotate** the Supabase keys that were in git (`Project Settings → API → Reset` for the service-role key; rotate any third-party keys too). The anon key is public by design, but the service-role key is not.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the host's environment variables (Production + Preview).
3. Supabase → Authentication → URL Configuration: **Site URL** = your production domain; **Redirect URLs** = `https://<your-domain>/**` and `http://localhost:8080/**` for local dev. Without this, OAuth/magic-link logins come back to the wrong site.
4. Push — CI builds and tests; the host runs `npm run build` and serves `dist/` with the SPA rewrite from `vercel.json` / `netlify.toml`.
5. Custom domain on the host → update Site URL (step 3) to match.

## Changelog

- 1.0.0 — production pass: config/secrets, auth flow, protected layout route, error handling, pagination, deploy config, tests + CI, demo mode.
- 0.0.0 — as generated (see `../before/`).
