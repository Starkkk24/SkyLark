# Decision Log — Skylark BI Agent

## Key Assumptions
- **Board layout is ours to shape.** Columns are matched by *title* (fuzzy), not hardcoded IDs, so
  the agent tolerates board tweaks. Where a board has near-duplicate columns (e.g. an empty
  "Expected Close Date" and a populated "Tentative Close Date"), each field is resolved to the
  single best-*filled* column, consistently across all rows.
- **Calendar quarters**, with "this quarter" relative to the server's current date. If a user
  clearly means a fiscal quarter, the agent is instructed to ask.
- **Currency**: inferred from symbols (`₹→INR`, `$→USD`, …); when absent, `DEFAULT_CURRENCY` (INR).
  Mixed currencies in a slice are surfaced as a caveat rather than silently summed as one figure.
- **The provided data is masked/coded** (e.g. `COMPANY089`, `OWNER_001`). The agent reports on the
  codes as-is; it doesn't attempt to de-anonymize.

## Trade-offs (and why)
- **API over MCP.** Direct GraphQL is more portable for a hosted Vercel prototype (no MCP server
  process to run) and gives precise control over pagination and error handling. Cursor pagination is
  implemented explicitly — the boards have 344 and 175 rows, well past monday's 25-row default page.
- **No database, no cache — live fetch per request.** The dataset is small; cleaning is milliseconds.
  A module-level cache on Vercel serverless is unreliable (instances are ephemeral and not shared), so
  a "fetch-once + refresh button" design would be a source of heisenbugs. Live fetch is *simpler and
  correct*: the app is always fresh, and the server stays stateless (conversation history lives in the
  client and is sent with each request).
- **Deterministic analytics, LLM only narrates.** LLMs are unreliable at summing hundreds of rows, so
  all arithmetic lives in `lib/analytics`. The model chooses filters/tools and writes the insight; the
  numbers it cites always come from code. This is the single most important correctness decision.
- **Provider-swappable AI via one OpenAI-compatible code path.** `AI_PROVIDER` selects Groq / Gemini /
  OpenAI (only base URL + key + model differ). This was validated the hard way: the assignment's Gemini
  key had `free_tier limit: 0` and the OpenAI key had `insufficient_quota`, so being able to flip
  providers by env — without code changes — turned a hard blocker into a one-line switch (Groq, free).
- **Errors degrade gracefully.** monday API failures (401/429/5xx) and AI-provider quota/auth errors
  are translated into clear user-facing messages with appropriate HTTP status codes, never a raw crash.

## How I Interpreted "Help Prepare Data for Leadership Updates"
Rather than a separate export feature, the agent can produce an **exec-ready summary on request**
("prepare a leadership update on …"): a **headline metric**, **2–3 supporting insights**, and a
**one-line data-quality note**. This reuses the same deterministic tools, so the numbers in a
leadership summary are identical to those in a normal answer — just formatted for a founder to paste
into a board update. It keeps scope tight while directly serving the intent (turn messy boards into a
trustworthy, shareable snapshot).

## What I'd Do Differently With More Time
- **Cross-board joining.** Deal client codes (`COMPANY0xx`) and work-order codes (`WOCOMPANY_0xx`) live
  in different namespaces, so name-based matching finds little overlap. Work orders carry a serial like
  `SDPLDEAL-075` that appears to reference a deal — with more time I'd join on that shared key and
  expose true deal→execution lineage.
- **Streaming responses** for snappier UX on multi-step tool calls.
- **Currency conversion** to a single reporting currency (with a rates source) instead of only caveating.
- **A thin caching layer for latency** (short TTL, best-effort) *if* profiling showed monday fetch is a
  bottleneck — kept out for now to preserve correctness and simplicity.
- **Unit tests** for the parsers (dates/currency) and analytics aggregations, plus an eval set of
  founder questions to guard against prompt regressions.
- **Auth** (Supabase + JWT) — scaffolded in the plan as an isolated, optional phase behind middleware;
  deferred because it isn't required and a login wall adds friction to "testable without local setup".

## Tech Stack Justification (brief)
Next.js App Router (UI + API in one deployable, native to Vercel) · React + Tailwind (fast, clean chat
UI) · OpenAI SDK against OpenAI-compatible providers (tool-calling with a single code path) ·
monday.com GraphQL (read-only) · zod for env + tool-arg validation · date-fns for tolerant date parsing.
