# Decision Log — Skylark BI Agent

A conversational BI agent that answers founder questions over two monday.com boards (Deals,
Work Orders), reading live data via the GraphQL API, cleaning it, and returning insights.
**Stack:** Next.js (App Router) + React + Tailwind on Vercel; OpenAI SDK against any
OpenAI-compatible LLM; zod (validation) + date-fns (date parsing). Deployed with GitHub Models.

## Key Assumptions
- **We own the board layout.** Columns are matched by *title* (fuzzy), never hardcoded IDs, so the
  agent tolerates board edits. Where a board has near-duplicate columns (e.g. an empty "Expected
  Close Date" and a populated "Tentative Close Date"), each field resolves **once per board** to the
  best-*filled* matching column — consistent across every row.
- **Calendar quarters**, with "this quarter" relative to the server's current date; the agent asks
  if a user clearly means a fiscal quarter.
- **Currency** is inferred from symbols (`₹→INR`, `$→USD`, lakh/crore handled); absent → `DEFAULT_CURRENCY`
  (INR). Mixed currencies in a slice are flagged, not silently summed.
- **Data is masked/coded** (`COMPANY089`, `OWNER_001`; deal names are placeholders like "Naruto").
  The agent reports codes/names as-is and does not attempt to de-anonymize.

## Trade-offs (and why)
- **API over MCP.** Direct GraphQL is more portable for a hosted Vercel prototype (no MCP process to
  run) and gives precise control over pagination + errors. Cursor pagination is explicit — the boards
  have 344 and 175 rows, well past monday's 25-row default page (a silent-truncation trap).
- **No database, no cache — live fetch per request.** Data is small; cleaning takes milliseconds. A
  module-level cache on Vercel serverless is unreliable (instances are ephemeral/unshared), so a
  "fetch-once + refresh button" design would be a heisenbug. Live fetch is *simpler and correct*:
  always fresh, server fully stateless (conversation history is sent from the client each turn).
- **Deterministic analytics; the LLM only routes + narrates.** LLMs are unreliable at summing hundreds
  of rows — and at unit conversion (an early answer rendered ₹81 Cr as ₹812 Cr). So **all arithmetic
  *and* currency formatting live in `lib/analytics`**; the model picks filters/tools and cites the
  pre-computed numbers/strings. This is the single most important correctness decision.
- **Provider-swappable AI via one OpenAI-compatible code path.** `AI_PROVIDER` selects GitHub Models /
  Groq / Gemini / OpenAI / any custom endpoint (only base URL + key + model differ). This earned its
  keep: the supplied Gemini key returned `free_tier limit: 0` and the OpenAI key `insufficient_quota`,
  so being able to flip providers by env — no code change — turned a hard blocker into a one-line switch.
- **Resilient interpretation, not just resilient parsing.** When a filter matches nothing, the tool
  returns the *actual* available sectors/statuses so the agent guides the user ("there's no Energy
  sector — did you mean Renewables?") instead of dead-ending at ₹0. Missing-value counts come from a
  structured quality report, so "how many are missing X" is exact, never estimated.
- **Errors degrade gracefully.** monday failures (401/429/5xx) and AI quota/auth errors become clear
  user-facing messages with correct HTTP status — never a raw crash.

## How I Interpreted "Help Prepare Data for Leadership Updates"
Not a separate export feature — the agent produces an **exec-ready summary on request** ("give me a
leadership update on …"): a **headline metric**, **2–3 supporting insights**, and a **one-line
data-quality note**. It reuses the same deterministic tools, so a leadership summary's numbers are
identical to a normal answer's — just formatted for a founder to paste into a board update. This keeps
scope tight while serving the intent: turn messy boards into a trustworthy, shareable snapshot.

## What I'd Do Differently With More Time
- **Cross-board joining.** Deal client codes (`COMPANY0xx`) and work-order codes (`WOCOMPANY_0xx`) are
  different namespaces, so name matching finds little overlap. Work orders carry a serial like
  `SDPLDEAL-075` that appears to reference a deal — I'd join on that real key to show deal→execution lineage.
- **Streaming responses** for snappier UX during multi-step tool calls.
- **Currency conversion** to a single reporting currency (with a rate source), not just caveats.
- **Unit tests** for the date/currency parsers and aggregations, plus an eval set of founder questions
  to catch prompt regressions.
- **Auth** (Supabase + JWT) — designed as an isolated, optional layer behind middleware; deferred
  because it isn't required and a login wall adds friction to "testable without local setup".
- **A duration/aging metric** for work orders (start→end, overdue) to answer "slowest execution" directly.
