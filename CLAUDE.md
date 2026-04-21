# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install
npm start        # CRA dev server at http://localhost:3000
npm run build    # Production build (served by Vercel)
```

No test runner, no lint script. There is no `npm test`.

The app is hosted on Vercel; pushes to `main` auto-deploy. The three files under `api/` are Vercel serverless functions, not part of the CRA bundle.

### Local dev notes
- Running `npm start` alone will NOT proxy the `/api/*` routes — those are Vercel functions. To test FMX / Claude calls locally use `vercel dev` (or test against the deployed app).
- `.env.example` lists required env vars. `REACT_APP_*` are bundled into the browser build; everything else is server-only and must never be imported from `src/`.

## Architecture

This is not a simple wizard tool — it's a multi-project workspace app with auth, server-side credential encryption, an admin console, and a prompt-engineering subsystem. The old "5-step wizard over a CSV" model is now one mode inside a larger Project workspace.

### The 3 runtime surfaces

1. **React SPA (`src/`)** — CRA build, all UI. Uses `supabase-js` directly for reads/writes on tables the user owns. Never calls `api.anthropic.com` or FMX directly from the browser.
2. **Vercel serverless (`api/`)** — three endpoints:
   - `api/claude.js` — thin proxy to Anthropic Messages API (adds retry on 429/529, injects `ANTHROPIC_API_KEY`).
   - `api/fmx.js` — proxy to customer FMX sites. Accepts either `{projectId, ...}` (looks up + decrypts saved creds) or `{siteUrl, email, password, ...}` (only used during the verify-before-save flow). Preferred shape is `projectId` so plaintext creds never traverse the browser→server boundary after the initial save.
   - `api/fmx-credentials.js` — encrypts FMX email/password with AES-256-GCM (`FMX_CRED_KEY`) and writes to `projects.fmx_credentials`. Plaintext touches the server exactly once.
3. **Supabase** — Postgres for all state (projects, imports, prompts, runs, corrections, dependency caches). RLS + service-role split: browser uses anon key; `api/_lib/supabaseAdmin.js` uses service-role for credential lookup. Two Edge Functions under `supabase/functions/` (`create-user`, `delete-user`) handle auth-admin operations.

### Data model (high level)

- **`projects`** — top-level workspace. Owns `fmx_site_url`, encrypted `fmx_credentials`, and is the parent for everything else.
- **Imports / runs** — each CSV or PDF the user processes becomes an import row with its mapped output and any recorded corrections.
- **Prompts subsystem** — admin-editable prompt templates + curated few-shot examples. Every Claude invocation that goes through `promptTemplates.js` logs an `extraction_run` with token usage and approximate USD cost. See `src/components/PromptsAdminTab.jsx` and `src/components/RunsAdminTab.jsx`.
- **Dependency caches** — FMX reference data (buildings, resources, users, etc.) is pulled via `fmxSync.js` and cached per-project so validation and push can resolve names → IDs offline.

### Key source files (read these first to orient)

- `src/App.js` — root, wizard state machine, routes between `ProjectScreen`, `SchemaOverview`, and the step components.
- `src/schemas.js` — the 16 FMX entity types and their module-qualified variants (e.g. `Work Request:maintenance`). `IMPORT_ORDER` is authoritative for FK dependencies.
- `src/fmxFieldMetadata.js` / `src/fmxFieldTypes.js` — enrichments and type categorization for FMX fields. These drive validation and the auto-mapping prompt.
- `src/db.js` — every Supabase read/write helper. All DB access goes through here — do not sprinkle raw `supabase.from(...)` calls in components.
- `src/apiClient.js` — `fmxFetch`, `claudeFetch`, credential helpers. The one place that talks to `/api/*`.
- `src/fmxSync.js` — syncs FMX reference data for a project, powers dependency resolution.
- `src/promptTemplates.js` — template interpolation, few-shot splicing, token→USD conversion. Both the PDF extraction and CSV mapping flows funnel through this.
- `src/promptDryRun.js` — re-runs a saved prompt against a historical extraction run so admins can diff before promoting a change.

### Entity types

Currently **16** entity types (not 6 — the README-era count is stale). Full list in `IMPORT_ORDER` in `src/schemas.js`. Import order encodes FK dependencies: Buildings must exist before Resources, Users before Equipment, etc.

### Credentials & security

- FMX passwords are encrypted at rest with AES-256-GCM using `FMX_CRED_KEY` (32-byte base64). See `api/_lib/crypto.js`.
- The older `btoa/atob` scheme in git history was **not** encryption and has been removed — do not reintroduce it.
- `scripts/migrate-fmx-creds.mjs` is the one-shot tool for rotating old-format creds; read it before touching credential code.
- Browser code should refer to saved credentials only by `projectId`. Plaintext passwords in the UI are allowed exactly once: the verify-before-save dialog.

### Supabase migrations

Live schema migrations are in `supabase/migrations/` (numbered `001_` through `016_`). **They have already been applied to production** — do not rewrite or consolidate them. New schema changes go in a new numbered file.

### Conventions worth knowing

- No external state library. Wizard state lives in `App.js` via `useState`; cross-cutting state is re-fetched from Supabase on demand.
- Inline styles from `src/theme.js` tokens (`C.orange`, `C.navy`, …). There is no CSS framework.
- `db.js` swallows errors and returns fallbacks (`[]`, `null`, `false`) — callers should check for falsy/empty results, not try/catch.
- When adding a Claude-powered feature, route it through `promptTemplates.js` so it picks up the admin-editable template + few-shots + run logging. Don't build a parallel prompt pipeline.
