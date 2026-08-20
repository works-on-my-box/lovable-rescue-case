# TaskFlow — `before/` (the app as it was handed over)

## The ticket

> **From the client (lightly edited):**
>
> Hi — I built a small team task tracker in Lovable (React + Supabase). It works in the Lovable preview,
> but I connected the GitHub repo to Vercel and now:
>
> 1. The Vercel build fails — `Command "npm run build" exited with 2`, something about TypeScript.
> 2. When I deploy it anyway, **login loops**: I sign in and land back on the login page. After a refresh I'm logged out again.
> 3. Opening a task link directly (e.g. `/tasks/42`) gives a **404** on Vercel, and sometimes just a **blank white page**.
> 4. The "Summarize with AI" button spins forever.
>
> Can you make this production-ready? I want it on Vercel with my own domain. Fixed price please — budget is limited.

This folder is the app exactly as received — a typical AI-builder handover. Do **not** use it as a template; see [`../after/`](../after/) for the fixed version and the [root README](../README.md) for the full symptom → root cause → fix table.

## See the problems yourself

```bash
npm install
npm run build        # fails: TypeScript errors (tsc runs before vite build)
npm run dev          # http://localhost:8080
```

- Sign in with anything → you bounce straight back to `/login`.
- Open `http://localhost:8080/tasks/42` without signing in → the page opens (no auth guard), then turns into a white screen.
- `git ls-files .env` → the `.env` file (with a *service role* key) is committed.

> All Supabase URLs / keys in this folder are **fake placeholders** (`https://xxxx.supabase.co`, `eyJ…not-a-real-key`). Requests to them fail — which is what reveals the missing error handling.
