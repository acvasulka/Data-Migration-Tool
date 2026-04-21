# FMX Data Migration Tool

A multi-project workspace for transforming customer data (CSV or PDF) into FMX-ready imports — with AI-assisted field mapping, bulk edits, validation, and direct push to FMX sites.

**Live app:** https://data-migration-tool-sbpa.vercel.app

---

## What it does

Teams sign in, create a **Project** per customer (with the customer's FMX site URL + API credentials), and then repeatedly run CSV or PDF files through a 4-step import flow for each of the 16 supported FMX entity types. The app remembers prior mappings, caches reference data from the customer's FMX site, and can push the finished records directly to FMX via API.

### Import flow (per file)

| Step | Name | Description |
|------|------|-------------|
| 1 | Upload | Drag-and-drop CSV, XLSX, or PDF. PDFs are OCR'd + extracted to a sheet via Claude. |
| 2 | Map | Claude auto-suggests a column → FMX field mapping; user adjusts, adds custom fields, or writes plain-English transform rules that Claude compiles into JS. |
| 3 | Validate | Spreadsheet view with cell-level errors, cross-sheet reference checks against cached FMX data, and natural-language bulk edits. |
| 4 | Export / Push | Download CSV/XLSX, or push directly to the project's FMX site via the API proxy. |

### Supported entity types (16)

Building, Resource, User, Equipment Type, Equipment, Inventory, Work Request, Schedule Request, Work Task, Transportation Request, Accounting Account, Requisition, Utility Provider, Equipment Log, Inventory Adjustment, Inventory Transfer.

Import order (see `IMPORT_ORDER` in `src/schemas.js`) encodes FK dependencies — Buildings before Resources, Users before Equipment, etc.

Work Request, Schedule Request, and Work Task also support module-qualified variants (e.g. `Work Request:maintenance`) so per-module schemas and prompts can diverge.

---

## AI features

All Claude calls are proxied through `/api/claude` (Vercel serverless) so the Anthropic API key never ships to the browser. The model is currently `claude-sonnet-4-20250514`.

- **Auto-mapping** — after upload, Claude reads column headers + sample rows and suggests FMX field mappings.
- **PDF extraction** — PDFs are parsed with `pdfjs-dist` and handed to Claude to structure into spreadsheet rows.
- **Transform rules** — describe a transformation in plain English ("combine first and last name columns"); Claude returns a JS function that runs in the browser.
- **Bulk edit** — in the validate step, describe a change in natural language; Claude applies it across all rows.
- **Admin-editable prompts** — every AI feature pulls its system prompt from the `prompts` table. Admins can edit, preview against a past run, diff the output, and promote.
- **Few-shot corrections** — user corrections in the validate step can be curated by admins into few-shot examples that get appended to the relevant prompt.

---

## Architecture

Three runtime surfaces:

1. **React SPA** (CRA, `src/`) — the UI. Talks to Supabase directly for data, and to `/api/*` for anything requiring secrets.
2. **Vercel serverless** (`api/`)
   - `api/claude.js` — Anthropic proxy with 429/529 retry.
   - `api/fmx.js` — FMX API proxy. Looks up + decrypts saved project credentials server-side so plaintext never crosses the browser boundary after initial save.
   - `api/fmx-credentials.js` — AES-256-GCM encryption of FMX email/password at rest.
3. **Supabase**
   - Postgres for all state: projects, imports, mapped rows, prompts, extraction runs, corrections, dependency caches.
   - Edge Functions (`supabase/functions/create-user`, `delete-user`) for auth-admin operations.
   - Migrations in `supabase/migrations/` (already applied to production).

### Project model

A **Project** = one customer. It owns:
- The FMX site URL and encrypted API credentials.
- A cached snapshot of FMX reference data (Buildings, Users, Resources, etc.) so validation can resolve names → IDs without hitting FMX on every keystroke.
- Every import run the team has done for that customer, with mapped rows, corrections, and token-usage telemetry.

Projects are owned by a user but discoverable by the rest of the team.

### Credentials & security

- FMX passwords are encrypted with **AES-256-GCM** using `FMX_CRED_KEY` before hitting the database.
- The browser refers to saved credentials only by `projectId`. Plaintext passwords exist in the UI exactly once: during the initial verify-and-save flow.
- Supabase RLS is in effect; the service-role key is used only by the Vercel API routes under `api/_lib/supabaseAdmin.js`.

### Admin panel

Accessible from the user menu for users with admin role. Tabs:

- **Prompts** — edit system prompts per feature, preview against a past extraction run, diff outputs, promote a new version.
- **Runs** — every Claude invocation is logged with input/output token counts and an approximate USD cost. Filter by feature, project, or time window.
- **Corrections** — user-made field-mapping corrections can be promoted into curated few-shot examples for the relevant prompt.

---

## Running locally

```bash
npm install
cp .env.example .env      # fill in values
npm start                 # http://localhost:3000
```

For full functionality (Claude calls, FMX proxy, credential encryption), you need `vercel dev` instead of `npm start` so the `/api/*` routes are served:

```bash
npm install -g vercel
vercel dev
```

### Environment variables

See `.env.example`. Summary:

| Variable | Where used |
|----------|------------|
| `REACT_APP_SUPABASE_URL` | Browser — Supabase client |
| `REACT_APP_SUPABASE_ANON_KEY` | Browser — Supabase client |
| `ANTHROPIC_API_KEY` | Server only — `/api/claude` |
| `SUPABASE_URL` | Server only — service-role client |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only — service-role client |
| `FMX_CRED_KEY` | Server only — AES-256-GCM master key (32 bytes base64) |

Generate a fresh `FMX_CRED_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Never** add any server-only variable to a `REACT_APP_*` name — it will be bundled into the browser build.

---

## Project layout

```
src/
  App.js                       # Root, routing, wizard state
  schemas.js                   # 16 FMX entity types + module-qualified variants
  db.js                        # All Supabase reads/writes (single chokepoint)
  apiClient.js                 # Talks to /api/* (Claude + FMX)
  supabase.js                  # Browser Supabase client
  fmxSync.js                   # Pulls & caches FMX reference data per project
  fmxTransform.js / fmxValidation.js / fmxUndo.js
  fmxFieldMetadata.js / fmxFieldTypes.js / fmxEndpoints.js
  promptTemplates.js           # Admin-editable prompt interpolation + usage logging
  promptDryRun.js              # Replay a past run against a new prompt
  pdfExtract.js                # PDF → sheet via pdfjs-dist + Claude
  claudeClient.js / utils.js   # Claude helpers + CSV utilities
  components/
    ProjectScreen.jsx          # Project home
    SchemaOverview.jsx         # Per-entity dashboard
    StepUpload / StepMapFields / StepValidate / StepExport
    FMXPushModal.jsx           # Direct push to FMX with per-row results
    AdminPanelModal.jsx        # Admin console (tabs below)
    PromptsAdminTab.jsx / RunsAdminTab.jsx / CorrectionsAdminTab.jsx
    DryRunDiffPanel.jsx / PromptDiffModal.jsx / RunDetailModal.jsx
    AuthScreen.jsx / UserMenu.jsx / ProfileEditModal.jsx
    ValidationSpreadsheet.jsx / RawSpreadsheet.jsx / NLEditPanel.jsx
    DependenciesView.jsx / DepResolveModal.jsx / PushHistoryView.jsx
    ProjectSettingsView.jsx / ProjectChecklist.jsx / WorkspaceSidebar.jsx
    ...
api/
  claude.js                    # Anthropic proxy
  fmx.js                       # FMX API proxy
  fmx-credentials.js           # Encrypt/decrypt FMX creds
  _lib/crypto.js               # AES-256-GCM helpers
  _lib/supabaseAdmin.js        # Service-role Supabase client
supabase/
  migrations/                  # 001_initial.sql … 016_*.sql (applied)
  functions/                   # Edge functions (create-user, delete-user)
scripts/
  migrate-fmx-creds.mjs        # One-shot rotation tool for old credential format
```

No external state library — wizard state lives in `App.js`. No test suite. Styling is inline using tokens from `src/theme.js`.

---

## Deployment

Hosted on Vercel; pushes to `main` auto-deploy. All server-side env vars (`ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `FMX_CRED_KEY`, etc.) are configured in the Vercel project settings.

Supabase Edge Functions are deployed separately via the Supabase CLI:

```bash
supabase functions deploy create-user
supabase functions deploy delete-user
```
