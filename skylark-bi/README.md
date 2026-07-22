# Skylark BI Agent

A conversational **Business Intelligence agent** that lets a founder or executive ask plain-English
questions and get trustworthy answers drawn **live** from two [monday.com](https://monday.com) boards
— **Deals** (sales pipeline) and **Work Orders** (project execution). It interprets the question,
pulls the relevant data over monday.com's GraphQL API, cleans the messy real-world values, computes
exact metrics **deterministically in code**, and returns a conversational answer with the data-quality
caveats that matter — not just a raw number.

> _"How's our pipeline looking for the renewables sector this quarter?"_
> → the agent filters deals by sector + quarter, sums the values, and replies with the figure, its
> share of the pipeline, and a note about any deals missing close dates.

---

## Table of Contents
1. [What it does](#what-it-does)
2. [Architecture overview](#architecture-overview)
3. [Tech stack (and why)](#tech-stack-and-why)
4. [Project structure](#project-structure)
5. [monday.com configuration](#mondaycom-configuration) ← **setup starts here**
6. [Environment variables](#environment-variables)
7. [Running locally](#running-locally)
8. [Deploying to Vercel](#deploying-to-vercel)
9. [AI provider options](#ai-provider-options)
10. [Data resilience](#data-resilience)
11. [Troubleshooting](#troubleshooting)

---

## What it does

- **Natural-language BI** over two monday.com boards — revenue, pipeline health, sectoral performance,
  operational metrics, and cross-board questions.
- **Deterministic numbers.** All arithmetic and currency formatting happen in code; the LLM only
  decides *which* data to pull and narrates the result. Figures are never hallucinated.
- **Messy-data resilient.** Inconsistent dates, currencies, placeholders, near-duplicate columns, and
  missing values are normalized gracefully, and every answer surfaces the caveats that affect it.
- **Guides instead of dead-ending.** Ask for a sector that doesn't exist and it tells you what *does*
  (e.g. "there's no Energy sector — did you mean Renewables?").
- **Clarifies when ambiguous** and produces **exec-ready "leadership update" summaries** on request.

---

## Architecture overview

### High-level flow

```
Founder (browser) ── Next.js chat UI
        │  sends full message history[]  (the server keeps NO session state)
        ▼
POST /api/chat
        │
        ▼
buildDataset()  ──►  monday.com GraphQL API   (fetch BOTH boards in parallel,
        │              (live, cursor-paginated, read-only)   no cache)
        ▼
normalize + data-quality assessment
        │
        ▼
AI Orchestrator  (LLM tool-calling loop)
   ├─ question ambiguous?  → ask ONE clarifying question, return
   └─ otherwise            → call deterministic analytics tools ──► exact numbers + caveats
        │
        ▼
LLM narrates the tool results  ──►  conversational answer (Markdown)
```

### Request lifecycle (step by step)

1. **UI → API.** The browser sends the entire conversation (`messages[]`) to `POST /api/chat`. Because
   the whole history travels with each request, the **server is completely stateless** — the natural
   fit for Vercel's serverless functions.
2. **Live fetch.** `buildDataset()` calls the monday.com GraphQL API for both boards **in parallel**,
   following cursor pagination to completion (the boards have 344 and 175 rows — well past monday's
   25-row default page, a classic silent-truncation trap).
3. **Normalize.** Raw rows are cleaned into typed `Deal` / `WorkOrder` objects: dates parsed from many
   formats, currency/amounts parsed (₹, lakh/crore, commas…), placeholders (`-`, `n/a`, `tbd`) turned
   into `null`, and each business field mapped to the right column (see *schema-level resolution* below).
4. **Assess quality.** A per-field report counts missing/placeholder values so answers can cite exact
   data-quality caveats.
5. **Orchestrate.** The cleaned dataset + the user's question go to the LLM, which is given a small set
   of **tools** (function schemas). It either asks a clarifying question or calls tools to filter and
   aggregate the data. **The tools do all math and formatting**; the model only chooses parameters.
6. **Narrate.** The model turns the tool results (numbers + caveats) into a concise, insightful reply,
   rendered as Markdown in the chat UI.

### Design principles

- **Live, no cache, no database.** Every query re-fetches from monday.com. The data is small and
  cleaning takes milliseconds, so live fetch is both *simpler* and *correct* — there's no stale-cache
  class of bugs, and nothing to "refresh". (A module-level cache on Vercel serverless is unreliable
  anyway, since instances are ephemeral and not shared.)
- **Deterministic analytics, LLM narration.** LLMs are unreliable at summing hundreds of rows and at
  unit conversion, so `lib/analytics` computes every number *and* pre-formats every ₹ value; the model
  quotes those. This is the single most important correctness decision.
- **Schema-level column resolution.** Each business field (e.g. "expected close date") is mapped to
  **one** monday column per board, chosen by the highest fill-rate among title-matching candidates.
  This fixes boards with near-duplicate columns (e.g. an empty "Expected Close Date" alongside a
  populated "Tentative Close Date") — consistently, for every row.
- **Title-based, fuzzy column mapping.** Columns are matched by normalized **title**, never hardcoded
  IDs, so the agent survives board edits.

### Module responsibilities

| Module | Responsibility |
|---|---|
| `lib/monday/` | GraphQL client — auth, `items_page` cursor pagination, typed errors; query strings. |
| `lib/normalize/` | `fields.ts` (date/currency/text parsers), `resolve.ts` (schema-level column resolution), `deals.ts` / `workOrders.ts` (raw → typed), `quality.ts` (missing-value report). |
| `lib/analytics/` | Deterministic tools the LLM composes: `getOverview`, `queryDeals`, `queryWorkOrders`, `crossBoard`. All math + ₹ formatting live here. |
| `lib/ai/` | `tools.ts` (tool JSON schemas + dispatch, zod-validated), `prompts.ts` (system prompt), `orchestrator.ts` (the tool-calling loop). |
| `lib/data/dataset.ts` | Per-request pipeline: fetch → normalize → assess. |
| `lib/config.ts` | Validated env + swappable AI-provider resolution. |
| `app/api/chat/` | The chat endpoint. `app/api/debug/` smoke-tests the pipeline without the LLM. |
| `components/` | `ChatWindow`, `MessageBubble` (Markdown rendering), `ChatInput`. |

---

## Tech stack (and why)

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router)** | UI + API routes in one deployable; first-class Vercel support. |
| UI | **React + Tailwind v4** + `react-markdown` | Fast to build a clean chat UI; renders the model's Markdown. |
| AI | **OpenAI SDK**, provider-swappable via `AI_PROVIDER` (GitHub Models / Groq / Gemini / OpenAI / any custom endpoint) | Tool-calling; all speak the OpenAI-compatible protocol, so one code path. Deployed with GitHub Models (free). |
| Data | **monday.com GraphQL API** (read-only) | More portable than MCP for a hosted prototype; precise control over pagination + error handling. |
| Validation | **zod** | Validates both environment config and LLM tool arguments. |
| Dates | **date-fns** | Tolerant multi-format date parsing. |
| State | **In-memory, per request only** | Small data + live fetch keeps it correct and simple — no DB/Redis. |

---

## Project structure

```
skylark-bi/
├─ app/
│  ├─ page.tsx                 # chat screen
│  ├─ layout.tsx               # root layout + metadata
│  └─ api/
│     ├─ chat/route.ts         # POST: messages[] -> dataset -> agent -> reply
│     └─ debug/route.ts        # GET: smoke-test the data pipeline (no LLM)
├─ components/
│  ├─ ChatWindow.tsx           # chat state + fetch orchestration
│  ├─ MessageBubble.tsx        # message rendering (Markdown for assistant)
│  └─ ChatInput.tsx            # auto-growing input
├─ lib/
│  ├─ config.ts                # validated env + AI provider resolution
│  ├─ monday/                  # client.ts (pagination), queries.ts
│  ├─ normalize/               # fields.ts, resolve.ts, deals.ts, workOrders.ts, quality.ts
│  ├─ analytics/index.ts       # deterministic tools (all math + ₹ formatting)
│  ├─ ai/                      # tools.ts, prompts.ts, orchestrator.ts
│  ├─ data/dataset.ts          # fetch → normalize → assess (per request)
│  └─ types/index.ts           # shared types
├─ .env.example                # every variable, documented
└─ README.md
```

---

## monday.com configuration

This is the most important setup step. The agent reads **only** from monday.com at runtime (it never
reads the CSVs), so the two boards must exist and the API credentials must be valid.

### Step 1 — Create a monday.com account
Sign up at [monday.com](https://monday.com) (the free trial is sufficient). You'll land in a workspace
where boards live.

### Step 2 — Import the two CSVs as separate boards
For **each** CSV (`Deal funnel Data.csv` and `Work_Order_Tracker Data.csv`):

1. In the workspace, click **Add ▸ Import data ▸ Excel / CSV** (or **+ ▸ Import**).
2. Upload the file.
3. When prompted, choose **Create a new board** (do **not** merge into an existing board).
4. Name them clearly — e.g. **Deals** and **Work Orders**.
5. monday will show a column-mapping preview. Accept the auto-detected columns; you can refine types in
   the next step. Finish the import.

You should now have two boards: one with ~344 deal rows, one with ~175 work-order rows.

### Step 3 — (Optional) set sensible column types
The agent maps columns by **title** and auto-detects the best-filled match, so exact types are **not**
critical. But setting these helps monday display the data and slightly improves parsing:

| Board | Column (example title) | Suggested type |
|---|---|---|
| Deals | Masked Deal value | Numbers |
| Deals | Tentative Close Date / Created Date | Date |
| Deals | Deal Stage, Deal Status | Status |
| Deals | Sector/service | Text or Status |
| Work Orders | Amount in Rupees … (Masked) | Numbers |
| Work Orders | Probable Start/End Date, Data Delivery Date | Date |
| Work Orders | Execution Status | Status |
| Work Orders | Sector | Text or Status |

> **How mapping works:** the agent normalizes each column title (lowercasing, stripping punctuation)
> and matches it against alias lists — e.g. `value / amount / deal value / cost / billing` for the
> money field, `close / closing / expected / tentative` for the close date. Among all matches it picks
> the column with the most non-empty cells. So you can rename or reorder columns freely, as long as the
> titles stay reasonably descriptive.

### Step 4 — Find each board's ID
Open a board; its URL looks like:
```
https://<your-account>.monday.com/boards/5030094411
                                          ^^^^^^^^^^  ← this is MONDAY_DEALS_BOARD_ID
```
Copy the numeric ID from each board's URL — one for Deals, one for Work Orders.

### Step 5 — Generate an API token
1. Click your **avatar (bottom-left) ▸ Developers** (or **Administration ▸ Connections ▸ API**).
2. Open **My Access Tokens ▸ Show / Generate**.
3. Copy the token. **Read access is sufficient** — the agent only issues read queries, never mutations.

> The token is a long JWT (~200+ characters). Copy it whole — a truncated paste is the #1 cause of a
> `401/403` from monday.com.

You now have everything the app needs: the **token** and the **two board IDs**.

---

## Environment variables

Copy `.env.example` → `.env.local` and fill in:

```bash
# ── monday.com (read-only) ──────────────────────────────
MONDAY_TOKEN=eyJ...                 # the API token from Step 5
MONDAY_DEALS_BOARD_ID=5030094411    # Deals board ID (Step 4)
MONDAY_WORKORDERS_BOARD_ID=5030095218

# ── AI provider (this is the deployed setup: GitHub Models, free) ──
# Needs a GitHub token with the "Models" permission (read).
AI_PROVIDER=custom
AI_BASE_URL=https://models.github.ai/inference
AI_MODEL=openai/gpt-4o-mini
AI_API_KEY=github_pat_...

# ── Business defaults ──────────────────────────────────
DEFAULT_CURRENCY=INR
```

See [AI provider options](#ai-provider-options) to use Groq / Gemini / OpenAI instead. Every variable
is validated on first use (`lib/config.ts`) with a clear error if something is missing.

---

## Running locally

```bash
npm install
npm run dev
# open http://localhost:3000
```

**Verify the data pipeline without spending an LLM call:**
```bash
curl http://localhost:3000/api/debug
```
This returns row counts, the full data-quality report, and sample normalized rows — the fastest way to
confirm your token + board IDs are correct.

---

## Deploying to Vercel

1. Push the repo to GitHub.
2. In Vercel, **Add New ▸ Project** and import the repo.
3. **Set Root Directory to `skylark-bi`** (the Next.js app lives in this subfolder — this is easy to miss).
4. Expand **Environment Variables** and add every variable from your `.env.local` (for **Production**
   and **Preview**). If you add them after the first deploy, trigger a **Redeploy** — Vercel only picks
   up env changes on a new build.
5. Deploy. The hosted URL is fully testable with no local setup.

---

## AI provider options

The provider is chosen entirely by env — **no code changes** to switch. All go through the OpenAI SDK.

| `AI_PROVIDER` | Required vars | Notes |
|---|---|---|
| `custom` | `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY` | Any OpenAI-compatible endpoint — **GitHub Models** (deployed), Cerebras, OpenRouter… |
| `groq` | `GROQ_API_KEY` (`GROQ_MODEL`) | Free, no billing; keys at `console.groq.com/keys`. |
| `gemini` | `GEMINI_API_KEY` (`GEMINI_MODEL`) | Free tier isn't available in every region. |
| `openai` | `OPENAI_API_KEY` (`OPENAI_MODEL`) | Requires account credits. |

Whichever you pick, the model must support **tool/function calling** (all the ones above do).

---

## Data resilience

- **Missing / placeholder values** (`-`, `n/a`, `tbd`, blank…) → normalized to `null` and counted.
- **Dates** — tolerant multi-format parsing (ISO, `dd/MM/yyyy`, `MMM yyyy`, monday's typed date JSON…).
- **Currency / amounts** — handles `₹ / $ / € / £`, Indian `lakh` / `crore`, `k` / `m`, and comma
  grouping; the ₹→Cr/L **display formatting is done in code** so the model can't mis-convert it.
- **Caveats surfaced** — every analytics result carries data-quality caveats for its slice, and the
  agent is instructed to state them (e.g. _"74 deals are missing close dates, so this may undercount"_).
- **Interpretation resilience** — an empty filter returns the *actual* available sectors/statuses so
  the agent suggests real alternatives instead of returning a bare ₹0.

## Example questions

- "How's our pipeline for the renewables sector this quarter?"
- "Which sector has the highest total deal value?"
- "Tell me about the Naruto deal." — looks up a deal by name
- "Which clients have both deals and active work orders?" — cross-board
- "Give me a leadership update on our sales pipeline." — exec-ready summary
- "How many records are missing close dates?" — exact count from the quality report

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `Data source error: monday.com rejected the API token (401/403)` | Token missing, truncated, or wrapped in quotes/whitespace in the environment. Re-copy the **full** token. On Vercel, re-check the env var and **redeploy**. |
| `Invalid environment configuration — …` | A required env var is missing. The message names it; see `.env.example`. |
| `AI provider quota/rate limit reached (429)` | The AI key has no quota/credits (e.g. Gemini free tier unavailable, OpenAI has no credit, or GitHub Models rate limit). Switch `AI_PROVIDER` or wait. |
| `403 no_access to model` (GitHub Models) | The GitHub token lacks the **Models: read** permission. Edit the token and grant it. |
| Only ~25 rows appear | Pagination not followed — the client loops the `items_page` cursor; check `lib/monday/client.ts` if you've modified it. |

---

See [`DECISION_LOG.md`](./DECISION_LOG.md) for key assumptions, trade-offs, the "leadership updates"
interpretation, and what I'd do with more time.
