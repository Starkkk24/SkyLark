# Skylark BI Agent

An AI business-intelligence agent that answers founder-level questions in natural language by
querying **monday.com** boards (Deals + Work Orders) live, cleaning the messy real-world data,
computing exact metrics deterministically, and returning conversational **insights** — not raw numbers.

> _"How's our pipeline looking for the mining sector this quarter?"_ → filtered, aggregated,
> and narrated with the relevant data-quality caveats.

---

## Architecture

```
Founder (browser, Next.js chat UI)
        │  full message history[]  (server is stateless)
        ▼
POST /api/chat  ─────────────────────────────────────────────┐
        │                                                     │
        ▼                                                     │
 buildDataset()  ── fetch BOTH boards in parallel ──▶ monday.com GraphQL API
        │            (cursor pagination, live, no cache)      │
        ▼                                                     │
 normalize + assess data quality                              │
        │                                                     │
        ▼                                                     │
 AI Orchestrator (tool-calling loop)                          │
   ├─ ambiguous? → ask ONE clarifying question                │
   └─ else → call deterministic analytics tools ──────────────┘
        │        (all arithmetic here; LLM never computes)
        ▼
 LLM narrates numbers + caveats → conversational reply
```

**Key principles**
- **Live, no cache.** Every query fetches fresh from monday.com. The server holds no state, which
  is exactly what Vercel serverless wants — no stale-cache class of bugs, nothing to "refresh".
- **Deterministic math, LLM narration.** Analytics functions compute every number; the LLM only
  chooses filters and writes the insight. Numbers are never hallucinated.
- **Schema-level column resolution.** Each business field is mapped to *one* board column (chosen
  by best fill-rate), so messy boards with near-duplicate columns stay consistent across rows.

## Tech Stack (and why)

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router)** | One codebase for UI + API routes; first-class Vercel deploy |
| UI | **React + Tailwind v4** | Fast to build a clean chat UI |
| AI | **OpenAI SDK**, provider-swappable (**Groq** / Gemini / OpenAI) | Tool-calling; Groq/Gemini expose OpenAI-compatible endpoints, so one code path |
| Data | **monday.com GraphQL API** (read-only) | Portable for a hosted prototype; precise control over pagination + errors |
| State | **In-memory per request only** | Small data; live fetch keeps it correct and simple |

## Project Structure

```
app/
  page.tsx                 # chat screen
  api/chat/route.ts        # POST: messages[] -> dataset -> agent -> reply
  api/debug/route.ts       # GET: smoke-test the data pipeline (no LLM)
components/                # ChatWindow, MessageBubble, ChatInput
lib/
  config.ts                # validated env + swappable AI provider
  monday/                  # GraphQL client (pagination) + queries
  normalize/               # field parsers, schema-level column resolver, quality
  analytics/               # deterministic tools: overview, queryDeals, queryWorkOrders, crossBoard
  ai/                      # tools (schemas+dispatch), prompts, orchestrator
  data/dataset.ts          # fetch → normalize → assess (per request)
  types/                   # shared types
```

---

## Setup

### 1. Configure monday.com

1. Import the two CSVs as **separate boards**:
   - `Deal funnel Data.csv` → a **Deals** board
   - `Work_Order_Tracker Data.csv` → a **Work Orders** board
2. Column types can be whatever's convenient (text/status/date/numbers) — the agent resolves
   columns by **title** (fuzzy) and picks the best-filled match, so exact types aren't critical.
   Keep titles reasonably descriptive.
3. Get your **API token**: monday.com → avatar → **Developers → My Access Tokens**.
4. Get each **board ID** from its URL: `…/boards/<BOARD_ID>`.

### 2. Environment variables

Copy `.env.example` → `.env.local` and fill in:

```bash
MONDAY_TOKEN=...
MONDAY_DEALS_BOARD_ID=...
MONDAY_WORKORDERS_BOARD_ID=...

# Pick ONE provider. Groq is free and needs no billing.
AI_PROVIDER=groq
GROQ_API_KEY=gsk_...        # https://console.groq.com/keys
# GROQ_MODEL=llama-3.3-70b-versatile   # default

DEFAULT_CURRENCY=INR
```

Alternative providers: `AI_PROVIDER=gemini` (`GEMINI_API_KEY`) or `AI_PROVIDER=openai`
(`OPENAI_API_KEY`, requires account credits).

### 3. Run locally

```bash
npm install
npm run dev
# http://localhost:3000
```

Verify the data pipeline without the LLM:

```bash
curl http://localhost:3000/api/debug   # counts, quality report, sample rows
```

### 4. Deploy to Vercel

1. Push to GitHub, import the repo in Vercel.
2. **Set Root Directory to `skylark-bi`** (the Next.js app is in that subfolder).
3. Add every variable from `.env.local` in **Project → Settings → Environment Variables**.
4. Deploy. The hosted URL is fully testable with no local setup.

---

## Data-Resilience Notes

- **Missing/placeholder values** (`-`, `n/a`, `tbd`, …) → normalized to `null` and counted.
- **Dates**: tolerant multi-format parsing (ISO, `dd/MM/yyyy`, `MMM yyyy`, typed monday date JSON, …).
- **Currency/amounts**: handles `₹/$/€/£`, Indian `lakh`/`crore`, `k`/`m`, and comma grouping.
- **Caveats**: every analytics result carries data-quality caveats for its slice; the agent is
  instructed to surface them (e.g. _"3 deals are missing close dates, so this may undercount"_).

See [`DECISION_LOG.md`](./DECISION_LOG.md) for assumptions, trade-offs, and the "leadership updates" interpretation.
