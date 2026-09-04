# FinPilot — AI Finance Controller

Razorpay Buildathon, Track 04. Read `PROJECT_CONTEXT.md` first — paste that file into any
new AI chat to restore full project context if you switch sessions/accounts.

## Setup

### 1. Database
```bash
mysql -u root -p < server/db/schema.sql
```

### 2. Generate synthetic test data
```bash
cd demo_data
node generate_data.js
# produces sales.csv, purchases.csv, payments.csv, credit_notes.csv
```

### 3. Server
```bash
cd server
npm install
cp .env.example .env
# fill in DB credentials, GROQ_API_KEY (free at console.groq.com),
# ANTHROPIC_API_KEY (console.anthropic.com), and SMTP creds for escalation email
npm run dev
```

### 4. Load the demo data
Upload the generated CSVs via:
- `POST /api/upload/sales` (form-data field: `file`)
- `POST /api/upload/purchases`
- `POST /api/upload/payments`

Or insert `credit_notes.csv` directly into MySQL (no upload route yet — small enough to
load manually for the demo, or add a route following the same pattern as `upload.js`).

### 5. Run reconciliation
```
POST /api/reconcile?type=sales
POST /api/reconcile?type=purchases
```
This streams live progress via Server-Sent Events — connect the React dashboard's
`EventSource` to this endpoint to show the live agent trace.

### 6. View results
- `GET /api/report/summary` — match rate breakdown by tier
- `GET /api/report/exceptions` — full exception list with evidence
- `GET /api/report/ca-export` — CA-ready structured report

## What's built vs. roadmap
See `PROJECT_CONTEXT.md` — Stages 0 through 6 are built. Stage 5B (customer payment
reminder + human approval queue) is intentionally scoped as roadmap, not built, to keep
the core loop solid rather than spreading effort thin. Say this honestly in the pitch.

## Still to build
- React dashboard (client/) — upload panel, live metrics, agent trace view, exception list
- Wire EventSource in React to `/api/reconcile` for the live trace
- credit_notes upload route (currently load via SQL directly, or copy upload.js pattern)
# finpilot-ai-recovery
