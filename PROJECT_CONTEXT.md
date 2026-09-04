# FinPilot — AI Finance Controller (Razorpay Buildathon, Track 04)

> PASTE THIS ENTIRE FILE INTO A NEW AI CHAT TO CONTINUE THE PROJECT WITH FULL CONTEXT.

## What this is
A submission for Razorpay's AI Buildathon, Track 04: "AI Finance Controller — Run the books
and the cash position." The track asks for an agent that closes one finance-ops loop across a
50+ record batch of synthetic data, reporting match rate and unresolved exceptions. The stated
bar: throughput + measured accuracy + an honest exception list. No cherry-picked demos.

## Stack
- Frontend: React
- Backend: Node.js / Express
- Database: MySQL
- Cheap AI tier: Groq (Llama 3.1-8b-instant / llama-3.3-70b-versatile) — OpenAI-compatible API
- Deep AI tier: Claude (Anthropic API) — tool-calling / agentic investigation

## The core idea (differentiator)
Most teams will run everything through one AI model. We instead use TIERED verification —
spend compute proportional to actual uncertainty:

```
Stage 0: CSV Ingestion (plug & play)
   User uploads sales.csv + purchase.csv + payments.csv → validated → loaded into MySQL
   ANY business can drop in their own export and it works — not tuned to one dataset.
        ↓
Stage 1: Rule-based matching (NO AI — free, instant)
   amount + date range + ID/reference match → auto-MATCHED
   Resolves ~60-80% of records at zero cost.
        ↓
Stage 2: Groq (cheap AI tier) — unmatched records only
   Handles fuzzy-but-simple cases: rounding, partial payments, minor date mismatch.
   Outputs: CONFIDENT (resolve here) or AMBIGUOUS (escalate to Stage 3).
        ↓
Stage 3: Claude (deep AI tier) — only genuinely ambiguous records (~10-20% of unmatched)
   Real tool-calling agent loop:
      getInvoice(id) → getPayment(id) → checkCreditNotes(customer_id)
      → checkPaymentHistory(customer_id) → checkDuplicates(payment_id)
   Produces: decision + confidence % + evidence list + recommended action.
   THIS is the live "agent trace" shown in the UI — the strongest demo moment.
        ↓
Stage 4: Classification + Audit Trail
   Every record → MATCHED | PARTIAL_PAYMENT | OVERDUE/PENDING | EXCEPTION
   Stored in MySQL `exceptions` table: status, confidence, evidence (JSON),
   recommended_action, timestamp, resolved_by_tier (rule/groq/claude).
   This table IS the audit trail and the match-rate report.
        ↓
Stage 5A: Internal escalation email (BUILT)
   EXCEPTION records above urgency threshold → auto-email to configured role
   (e.g. AR/Collections lead). Can be automatic — internal, low risk.
        ↓
Stage 6: CA-ready export (BUILT)
   PDF/Excel report per period: summary, matched list, AI-assisted matches
   (labeled by tier + confidence), unresolved exceptions (never mislabeled as resolved).
   Framing: "pre-sorts the obvious 80% so a CA's review time goes only to what needs
   judgment" — NEVER claim "AI verifies/certifies the books," that overclaims into
   regulated compliance territory. Call it "reconciliation report" or "audit support export."
```

### Explicitly OUT OF SCOPE (roadmap only, mention honestly in pitch, don't build)
- Stage 5B: Customer payment reminder emails + human approval queue — good idea,
  real value, but it's a second email system with its own UI. Cut for time; state as
  "next step" in the pitch rather than half-building it.
- Cash-flow forecasting, tax-line matching, settlement Q&A — these are OTHER example
  directions the track offered. We picked reconciliation as our spine. Do not drift
  into these — depth beats breadth here.

## Why this scope (in case a future AI/session suggests adding more)
The person building this (a student, own ERP/company, React/Node/MySQL stack) already went
through an extensive brainstorm and deliberately drew a line to stop scope creep. The explicit
prior conclusion: "this is the end point of thinking, we can't go deeper" — meaning any new
AI session should DEFAULT TO EXECUTION, not propose new features, unless the user explicitly
asks to reconsider scope.

The test for any new feature idea: "does this make the core loop (reconcile → detect →
investigate → act) work better, or does it add a new loop?" Only the former belongs in scope.

## Data ownaership note
The synthetic data / ERP structure is based on the user's own company — no third-party IP
concerns. Real sensitive data (names, bank details) should still be synthetic/scrubbed for
the public repo submission, but there's no permission issue since they own the business.

## Pitch line (for the 5-min pitch / README)
"FinPilot reconciles a business's own sales/purchase/payment data with tiered AI — free rules
first, cheap AI for fuzzy cases, and deep agentic investigation reserved for the truly
ambiguous ~10%. It closes the loop by escalating exceptions internally and gives a CA-ready
audit export — not just detecting problems, but acting on them responsibly, at a cost profile
that could actually run in production."

## Build order (in progress — update this section as you go)
1. [ ] MySQL schema (sales, purchases, payments, exceptions tables)
2. [ ] Synthetic data generator (50+ records with deliberate exception patterns)
3. [ ] Node/Express: CSV upload + rule-based matcher
4. [ ] Groq integration (cheap tier)
5. [ ] Claude integration (deep tier, tool-calling agent)
6. [ ] React dashboard: upload panel, metrics, live agent trace, exception list
7. [ ] Internal escalation email (nodemailer)
8. [ ] CA-ready export (PDF/Excel)

## Key implementation details agreed on
- Groq free tier has low tokens-per-minute limits — mitigate by only routing genuinely
  unmatched records to it (not the whole batch), and only escalating a small subset to Claude.
- Agent tool-calling loop should be provider-agnostic (swappable client) as a safety net.
- Live agent trace in the React UI (streaming tool-call steps, e.g. via SSE) is the single
  highest-value visual feature for the demo — worth extra effort.
- Show at least one genuine unresolved/failure case in the demo on purpose — the track
  explicitly wants honest exception handling, not a suspiciously perfect 100% match rate.

## What to ask the user when resuming
If picking this up fresh, confirm: what's already built (check the repo/files), and which
build-order step to continue from.
