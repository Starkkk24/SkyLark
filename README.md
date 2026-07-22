# SkyLark - monday.com Business Intelligence Agent

SkyLark is a conversational business-intelligence agent for founder-level questions over live
[monday.com](https://monday.com) data. It reads two monday.com boards - **Deals** and **Work Orders** -
through the monday GraphQL API, normalizes messy operational data, computes metrics deterministically
in TypeScript, and returns concise answers with relevant data-quality caveats.

The runnable Next.js app lives in [`skylark-bi/`](./skylark-bi).

## What It Does

- Answers natural-language questions about sales pipeline, deal value, sectors, stages, work orders,
  execution status, and cross-board relationships.
- Fetches monday.com data live on every request. There is no database, background sync, or stale cache.
- Uses an LLM for intent routing and explanation, while all filtering, aggregation, currency parsing,
  and number formatting happen in code.
- Handles imperfect spreadsheet-style data: blank values, placeholders, duplicate-ish columns,
  inconsistent date formats, currency symbols, Indian units such as lakh/crore, and missing fields.
- Produces leadership-ready summaries when asked, using the same deterministic analytics path as normal
  answers.

Example questions:

- "How is our pipeline looking for the renewables sector this quarter?"
- "Which sector has the highest total deal value?"
- "Tell me about the Naruto deal."
- "Which clients have both deals and active work orders?"
- "Give me a leadership update on the sales pipeline."
- "How many records are missing close dates?"

## Architecture Overview

```text
Browser chat UI
   |
   | POST /api/chat with full messages[]
   v
Next.js API route
   |
   | buildDataset()
   v
monday.com GraphQL API
   |
   | fetch Deals + Work Orders in parallel
   | follow cursor pagination until all items are loaded
   v
Normalization layer
   |
   | resolve columns by title
   | parse dates, money, text, placeholders
   | build data-quality reports
   v
AI orchestrator
   |
   | model chooses validated tools
   | deterministic analytics tools compute results
   v
Markdown answer with exact metrics and caveats
```

### Request Lifecycle

1. The React chat UI sends the full conversation history to `POST /api/chat`.
2. The API route validates the request body and calls `buildDataset()`.
3. `buildDataset()` fetches both monday boards using `lib/monday/client.ts`.
4. The monday client uses `items_page` and `next_items_page` cursor pagination so boards are not
   silently truncated at monday.com's default page size.
5. `lib/normalize/*` converts raw monday items into typed `Deal` and `WorkOrder` records.
6. `lib/normalize/quality.ts` counts missing and placeholder values so answers can disclose caveats.
7. `lib/ai/orchestrator.ts` runs a tool-calling loop with the configured OpenAI-compatible model.
8. `lib/analytics/index.ts` performs the real math and returns preformatted metrics.
9. The model narrates those tool results as a final Markdown answer.

### Design Choices

- **Live per request:** The boards are small enough to fetch on demand. This keeps deployment simple
  and avoids cache invalidation problems in serverless environments.
- **Stateless server:** Conversation history is carried by the browser. The API does not need sessions
  to answer follow-up questions.
- **Deterministic analytics:** The LLM never performs business arithmetic. It decides which tool to
  call; the tool returns exact counts, sums, shares, and caveats.
- **Title-based column resolution:** Business fields are mapped from monday column titles instead of
  hardcoded column IDs. This lets the app tolerate renamed, reordered, or recreated columns.
- **Schema-level field choice:** If multiple columns look like "close date" or "amount", the resolver
  picks the best-filled matching column once for the board, then uses that same mapping for every row.

## Project Structure

```text
.
|-- README.md                    # repository-level overview and setup
|-- DECISION_LOG.md              # assumptions, trade-offs, and future work
`-- skylark-bi/
    |-- app/
    |   |-- page.tsx             # chat screen
    |   `-- api/
    |       |-- chat/route.ts    # main agent endpoint
    |       `-- debug/route.ts   # data-pipeline smoke test
    |-- components/              # ChatWindow, MessageBubble, ChatInput
    |-- lib/
    |   |-- config.ts            # validated environment config
    |   |-- monday/              # GraphQL queries and paginated client
    |   |-- normalize/           # parsers, column resolution, quality reports
    |   |-- analytics/           # deterministic metrics and formatting
    |   |-- ai/                  # prompts, tool schemas, tool loop
    |   |-- data/dataset.ts      # fetch -> normalize -> assess pipeline
    |   `-- types/               # shared TypeScript types
    |-- .env.example             # required and optional env vars
    `-- package.json
```

## Tech Stack

| Layer | Choice | Why |
| --- | --- | --- |
| App | Next.js App Router | UI and API routes in one Vercel-friendly app. |
| UI | React, Tailwind CSS, react-markdown | Chat interface with Markdown assistant replies. |
| Data source | monday.com GraphQL API | Hosted, read-only access to live board data. |
| AI | OpenAI SDK with OpenAI-compatible providers | One tool-calling code path for Groq, Gemini, OpenAI, GitHub Models, or custom endpoints. |
| Validation | zod | Validates environment variables and model tool arguments. |
| Dates | date-fns | Tolerant parsing for imported spreadsheet dates. |

## monday.com Configuration

This is the critical setup. At runtime the app reads monday.com directly; it does not read CSV files
from the repository. You need two monday boards and one API token.

### 1. Create or Open a monday.com Workspace

Use an existing monday.com account or create a new one. A trial workspace is enough for this app as
long as you can create boards and generate an API token.

### 2. Create Two Boards

Create or import these as separate boards:

| Board | Purpose | Expected rows in the sample data |
| --- | --- | --- |
| Deals | Sales pipeline, deal values, sectors, stages, owners, expected close dates | About 344 |
| Work Orders | Delivery/execution tracker, order value, status, dates, owners, sectors | About 175 |

If you are starting from CSV exports:

1. In monday.com, choose **Add** or **+**, then **Import data**.
2. Select **Excel / CSV**.
3. Upload the Deals CSV and choose **Create a new board**.
4. Name the board something obvious, such as `Deals`.
5. Repeat the import for the Work Orders CSV and name it `Work Orders`.
6. Accept monday's automatic column detection. You can adjust column types afterward.

### 3. Keep Column Titles Descriptive

The code resolves fields by column title, not by monday column ID. Exact names are flexible, but titles
should clearly describe their business meaning.

Recommended examples:

| Board | Business field | Good title examples |
| --- | --- | --- |
| Deals | Client/account | `Client`, `Company`, `Customer`, `Account` |
| Deals | Sector | `Sector`, `Industry`, `Vertical`, `Domain` |
| Deals | Deal stage | `Deal Stage`, `Pipeline Stage`, `Funnel Stage` |
| Deals | Status | `Deal Status`, `Status`, `State` |
| Deals | Value | `Deal Value`, `Amount`, `Revenue`, `Contract Value`, `Masked Deal Value` |
| Deals | Created date | `Created Date`, `Open Date`, `Date Added` |
| Deals | Close date | `Expected Close Date`, `Tentative Close Date`, `Target Date` |
| Work Orders | Client/account | `Client`, `Company`, `Customer` |
| Work Orders | Execution status | `Execution Status`, `Status`, `Progress`, `Stage` |
| Work Orders | Value | `Amount`, `Cost`, `Billing`, `Revenue`, `Amount in Rupees` |
| Work Orders | Start date | `Start Date`, `Probable Start Date`, `Kickoff Date` |
| Work Orders | End date | `End Date`, `Due Date`, `Completion Date`, `Delivery Date` |

Column types do not have to be perfect because the normalizer reads monday's text and JSON values, but
these types make the boards easier to maintain:

| Data | Suggested monday column type |
| --- | --- |
| Money / amount fields | Numbers |
| Dates | Date |
| Stage and status fields | Status |
| Sector, owner, client, region | Text, Status, People, or Dropdown as appropriate |

### 4. Find the Board IDs

Open each monday board in the browser. The URL contains the board ID:

```text
https://your-workspace.monday.com/boards/5030094411
                                      ^^^^^^^^^^
```

Use the Deals board number as `MONDAY_DEALS_BOARD_ID` and the Work Orders board number as
`MONDAY_WORKORDERS_BOARD_ID`.

### 5. Generate an API Token

1. In monday.com, open your avatar/profile menu.
2. Go to **Developers** or **Administration -> Connections -> API**.
3. Open **My Access Tokens**.
4. Generate or reveal a personal API token.
5. Copy the whole token into `MONDAY_TOKEN`.

The app only performs read queries. It does not create, update, or delete monday items.

### 6. Verify monday.com Access

After local env setup, run the app and open:

```text
http://localhost:3000/api/debug
```

A healthy response includes:

- `ok: true`
- counts for both boards
- normalized sample rows
- a data-quality report
- an overview object from the analytics layer

If this endpoint fails, fix monday credentials before testing chat. It avoids spending AI calls while
you are still validating data access.

## Environment Variables

Create a local env file from the example:

```bash
cd skylark-bi
cp .env.example .env.local
```

Minimum required configuration:

```bash
# monday.com, read-only GraphQL access
MONDAY_TOKEN=your_monday_api_token
MONDAY_DEALS_BOARD_ID=5030094411
MONDAY_WORKORDERS_BOARD_ID=5030095218

# Pick one AI provider. Groq is the default in .env.example.
AI_PROVIDER=groq
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-3.3-70b-versatile

# Business default for values without an explicit currency symbol
DEFAULT_CURRENCY=INR
```

Supported AI provider options:

| `AI_PROVIDER` | Required variables | Notes |
| --- | --- | --- |
| `groq` | `GROQ_API_KEY`, optional `GROQ_MODEL` | Free/fast OpenAI-compatible endpoint. |
| `gemini` | `GEMINI_API_KEY`, optional `GEMINI_MODEL` | Uses Gemini's OpenAI-compatible endpoint. |
| `openai` | `OPENAI_API_KEY`, optional `OPENAI_MODEL` | Requires OpenAI credits/billing. |
| `custom` | `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | Any OpenAI-compatible endpoint, such as GitHub Models, Cerebras, or OpenRouter. |

All environment variables are validated lazily by [`skylark-bi/lib/config.ts`](./skylark-bi/lib/config.ts),
so build can succeed without secrets, and missing runtime configuration produces a clear error.

## Running Locally

```bash
cd skylark-bi
npm install
npm run dev
```

Open `http://localhost:3000`.

Useful checks:

```bash
# Data source, normalization, quality report, and analytics smoke test
curl http://localhost:3000/api/debug

# Static/type/build validation
npm run build
```

## Deploying to Vercel

1. Push this repository to GitHub.
2. In Vercel, create a new project from the repo.
3. Set **Root Directory** to `skylark-bi`.
4. Add the same env vars from `.env.local` in Vercel project settings.
5. Deploy.
6. If you edit env vars after the first deployment, redeploy so Vercel picks up the new values.

## Troubleshooting

| Symptom | Likely fix |
| --- | --- |
| `Data source error: monday.com rejected the API token (401/403)` | Re-copy the full monday token. Check for quotes, spaces, or a token from the wrong account. |
| `Board <id> not found or not accessible` | Confirm the board ID from the URL and make sure the token's user can open that board. |
| Only about 25 rows load | monday pagination has been broken or modified. Check `lib/monday/client.ts`. |
| `Invalid environment configuration` | A required env var is missing. The error message names the variable. |
| AI provider returns 401/403 | The key does not match `AI_PROVIDER`, or the token lacks model access. |
| AI provider returns 429 | The provider has no quota, rate limit is exhausted, or billing/credits are not enabled. |

## More Context

- App-specific README: [`skylark-bi/README.md`](./skylark-bi/README.md)
- Decision log: [`DECISION_LOG.md`](./DECISION_LOG.md)
