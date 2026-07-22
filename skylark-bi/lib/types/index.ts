// ── Monday raw shapes (as returned by the GraphQL client) ──────────

export interface MondayColumnValue {
  id: string;
  title: string; // resolved from column.title
  text: string | null; // display text (may be "")
  value: string | null; // raw JSON string (typed columns)
  type: string; // monday column type, e.g. "status", "date", "numbers"
}

export interface MondayItem {
  id: string;
  name: string;
  columnValues: MondayColumnValue[];
}

// ── Cleaned business entities ──────────────────────────────────────

/** A monetary amount after currency normalization. */
export interface Money {
  amount: number | null; // numeric value, null if missing/unparseable
  currency: string; // ISO-ish code, e.g. "INR", "USD"
  raw: string | null; // original string as seen in Monday
}

export interface Deal {
  id: string;
  name: string;
  client: string | null;
  sector: string | null;
  stage: string | null;
  status: string | null;
  owner: string | null;
  value: Money;
  createdDate: string | null; // ISO yyyy-mm-dd or null
  expectedCloseDate: string | null; // ISO yyyy-mm-dd or null
  region: string | null;
  raw: Record<string, string>; // every column by title (display text)
}

export interface WorkOrder {
  id: string;
  name: string;
  client: string | null;
  sector: string | null;
  status: string | null;
  owner: string | null;
  value: Money;
  startDate: string | null; // ISO or null
  endDate: string | null; // ISO or null (due/completion)
  region: string | null;
  raw: Record<string, string>;
}

// ── Data-quality reporting ─────────────────────────────────────────

export interface FieldQuality {
  field: string;
  total: number;
  missing: number; // null/empty
  invalid: number; // present but unparseable (e.g. bad date/number)
}

export interface BoardQuality {
  board: "deals" | "workOrders";
  totalRows: number;
  fields: FieldQuality[];
  notes: string[]; // human-readable caveats worth surfacing
}

/** The full cleaned dataset handed to the analytics/AI layer per request. */
export interface Dataset {
  deals: Deal[];
  workOrders: WorkOrder[];
  quality: {
    deals: BoardQuality;
    workOrders: BoardQuality;
  };
  fetchedAt: string; // ISO timestamp of this live fetch
}

// ── Analytics tool result envelope ─────────────────────────────────

export interface ToolResult {
  summary: string; // short natural-language summary of the result
  data: unknown; // structured numbers/rows the model can cite
  caveats: string[]; // data-quality caveats that apply to THIS slice
}
