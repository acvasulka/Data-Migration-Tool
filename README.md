# FMX Data Migration Tool

A browser-based wizard for transforming CSV data into FMX (Facilities Management System) import format. Built with React 18, powered by Claude AI for intelligent field mapping and bulk edits.

**Live app:** https://data-migration-tool-sbpa.vercel.app

---

## What it does

Takes a customer's existing CSV export and walks you through 5 steps to produce a clean, validated CSV ready for FMX import — with AI assistance at every ambiguous step.

### Wizard steps

| Step | Name | Description |
|------|------|-------------|
| 1 | Select Type | Choose one of 6 FMX entity types |
| 2 | Upload CSV | Drag-and-drop CSV upload; Claude auto-suggests field mappings |
| 3 | Map Fields | Confirm/adjust column mappings; add transform rules and custom fields |
| 4 | Validate & Edit | Spreadsheet view with inline editing and AI-powered bulk edits |
| 5 | Export | Download the final mapped CSV |

### Supported entity types

- **Building** — facilities with operating hours, work request settings, scheduling periods
- **Resource** — bookable spaces within buildings, with rate buckets and scheduling rules
- **User** — staff and user accounts
- **Equipment Type** — equipment categories
- **Equipment** — individual equipment items linked to buildings/locations
- **Inventory** — inventory items

Import order matters: Buildings → Resources → Users → Equipment Types → Equipment → Inventory

---

## AI features

All three AI features call `claude-sonnet-4-20250514` directly from the browser (no backend):

- **Auto-mapping** — after upload, Claude reads your CSV headers and suggests which FMX fields they map to
- **Transform rules** — describe a transformation in plain English (e.g. "combine first and last name columns"); Claude generates the JS function
- **Bulk edit** — in the validate step, describe a change in natural language (e.g. "set all buildings in Texas to timezone CST"); Claude applies it across all rows

---

## Running locally

```bash
npm install
npm start        # Dev server at http://localhost:3000
npm run build    # Production build
```

Requires an Anthropic API key. The key is set in the app source — see `src/utils.js` for where the `fetch` call to `api.anthropic.com` is made.

---

## Project structure

```
src/
  App.js                    # Root component, wizard state, navigation
  schemas.js                # FMX field schemas for all 6 entity types
  utils.js                  # CSV parsing, mapping, validation, Claude API calls
  theme.js                  # Color tokens (FMX brand)
  components/
    StepSelectType.jsx
    StepUpload.jsx
    StepMapFields.jsx
    StepValidate.jsx
    StepExport.jsx
    TransformModal.jsx      # Natural language transform rule builder
    SessionHistory.jsx      # Previous sessions sidebar
    DataPreviewModal.jsx    # Raw CSV preview
    Badge.jsx
    Modal.jsx
```

No external state management. All wizard state lives in `App.js` via `useState`. No test suite.

---

## Key behaviors

- **Custom fields** — Building and Resource types support adding arbitrary custom fields in the Map Fields step
- **Dynamic rate buckets** — Resource type supports adding multiple cost/unit rate pairs
- **Cross-sheet references** — fields like `Building` on a Resource record validate against previously imported Building names
- **Error gating** — you cannot export if validation errors exist unless you explicitly certify the data anyway
- **XLSX export** — the export step can produce `.xlsx` in addition to `.csv`

---

## Deployment

Hosted on Vercel. Pushes to `main` auto-deploy. No environment variables needed on the Vercel side — the API key is bundled in the build.
