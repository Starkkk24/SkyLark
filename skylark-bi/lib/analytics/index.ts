import type { Dataset, Deal, Money, ToolResult } from "@/lib/types";

/**
 * Deterministic analytics. ALL arithmetic lives here — the LLM only chooses
 * filters and narrates the returned numbers, never computes them itself.
 * Every function returns a ToolResult carrying caveats for its specific slice.
 */

// ── Shared helpers ─────────────────────────────────────────────────

/** Case-insensitive "contains" match; undefined query matches everything. */
function matches(value: string | null, query?: string): boolean {
  if (!query) return true;
  if (value === null) return false;
  return value.toLowerCase().includes(query.toLowerCase());
}

/** Calendar-quarter bounds as yyyy-MM-dd strings (string compare is safe). */
function quarterBounds(quarter?: number, year?: number): { start: string; end: string } | null {
  if (!quarter && !year) return null;
  const y = year ?? new Date().getFullYear();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (quarter && quarter >= 1 && quarter <= 4) {
    const startMonth = (quarter - 1) * 3;
    return {
      start: iso(new Date(Date.UTC(y, startMonth, 1))),
      end: iso(new Date(Date.UTC(y, startMonth + 3, 0))),
    };
  }
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}

function inRange(dateIso: string | null, bounds: { start: string; end: string } | null): boolean {
  if (!bounds) return true;
  if (dateIso === null) return false;
  return dateIso >= bounds.start && dateIso <= bounds.end;
}

interface MoneySummary {
  count: number;
  withValue: number;
  missingValue: number;
  sum: number;
  avg: number | null;
  currency: string;
  mixedCurrencies: string[]; // >1 means totals are cross-currency
}

function summarizeMoney(rows: { value: Money }[]): MoneySummary {
  const withVal = rows.filter((r) => r.value.amount !== null);
  const sum = withVal.reduce((n, r) => n + (r.value.amount ?? 0), 0);
  const currencies = [...new Set(withVal.map((r) => r.value.currency))];
  return {
    count: rows.length,
    withValue: withVal.length,
    missingValue: rows.length - withVal.length,
    sum,
    avg: withVal.length ? Math.round(sum / withVal.length) : null,
    currency: currencies[0] ?? "INR",
    mixedCurrencies: currencies,
  };
}

/**
 * Pre-format money for narration so the LLM never does the ₹→Cr/L conversion
 * itself (it gets the 10× wrong). INR uses Indian crore/lakh; others use grouped.
 */
function formatMoney(amount: number | null, currency: string): string {
  if (amount === null) return "n/a";
  if (currency === "INR") {
    const abs = Math.abs(amount);
    if (abs >= 1e7) return `₹${(amount / 1e7).toFixed(2)} Cr`;
    if (abs >= 1e5) return `₹${(amount / 1e5).toFixed(2)} L`;
    return `₹${Math.round(amount).toLocaleString("en-IN")}`;
  }
  const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : `${currency} `;
  return `${sym}${Math.round(amount).toLocaleString("en-US")}`;
}

function groupCounts<T>(rows: T[], key: (r: T) => string | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = key(r) ?? "(unspecified)";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function moneyCaveats(m: MoneySummary, entity: string): string[] {
  const caveats: string[] = [];
  if (m.missingValue > 0) {
    caveats.push(`${m.missingValue} of ${m.count} ${entity} have no value recorded; totals reflect only the ${m.withValue} with values.`);
  }
  if (m.mixedCurrencies.length > 1) {
    caveats.push(`Mixed currencies present (${m.mixedCurrencies.join(", ")}); the summed total is not currency-adjusted.`);
  }
  return caveats;
}

// ── Filters ────────────────────────────────────────────────────────

export interface DealFilter {
  name?: string; // deal name, e.g. "Naruto" (distinct from masked client code)
  sector?: string;
  stage?: string;
  status?: string;
  owner?: string;
  region?: string;
  client?: string;
  dateField?: "createdDate" | "expectedCloseDate";
  quarter?: number;
  year?: number;
  minValue?: number;
  groupBy?: "sector" | "stage" | "status" | "owner" | "region";
}

/** Distinct non-null values for a field (for "no match → here's what exists" hints). */
function distinctValues<T>(rows: T[], key: (r: T) => string | null): string[] {
  return [...new Set(rows.map(key).filter((v): v is string => v !== null))];
}

export interface WorkOrderFilter {
  name?: string; // work-order / deal name, e.g. "Scooby-Doo"
  sector?: string;
  status?: string;
  owner?: string;
  region?: string;
  client?: string;
  dateField?: "startDate" | "endDate";
  quarter?: number;
  year?: number;
  minValue?: number;
  groupBy?: "sector" | "status" | "owner" | "region";
}

// ── Tool: overview ─────────────────────────────────────────────────

export function getOverview(ds: Dataset): ToolResult {
  const dealMoney = summarizeMoney(ds.deals);
  const woMoney = summarizeMoney(ds.workOrders);
  return {
    summary: `${ds.deals.length} deals (pipeline ~${dealMoney.sum} ${dealMoney.currency}) and ${ds.workOrders.length} work orders.`,
    data: {
      deals: {
        count: ds.deals.length,
        pipelineValue: dealMoney.sum,
        pipelineValueDisplay: formatMoney(dealMoney.sum, dealMoney.currency),
        currency: dealMoney.currency,
        topSectors: groupCounts(ds.deals, (d) => d.sector),
        stages: groupCounts(ds.deals, (d) => d.stage),
      },
      workOrders: {
        count: ds.workOrders.length,
        totalValue: woMoney.sum,
        totalValueDisplay: formatMoney(woMoney.sum, woMoney.currency),
        statuses: groupCounts(ds.workOrders, (w) => w.status),
        topSectors: groupCounts(ds.workOrders, (w) => w.sector),
      },
      // Exact per-field missing counts — cite these for "how many missing X" questions.
      dataQuality: {
        deals: ds.quality.deals.fields,
        workOrders: ds.quality.workOrders.fields,
      },
      fetchedAt: ds.fetchedAt,
    },
    caveats: [...ds.quality.deals.notes, ...ds.quality.workOrders.notes],
  };
}

// ── Tool: query deals ──────────────────────────────────────────────

export function queryDeals(ds: Dataset, filter: DealFilter): ToolResult {
  const bounds = quarterBounds(filter.quarter, filter.year);
  const dateField = filter.dateField ?? "expectedCloseDate";

  const filtered = ds.deals.filter(
    (d) =>
      matches(d.name, filter.name) &&
      matches(d.sector, filter.sector) &&
      matches(d.stage, filter.stage) &&
      matches(d.status, filter.status) &&
      matches(d.owner, filter.owner) &&
      matches(d.region, filter.region) &&
      matches(d.client, filter.client) &&
      inRange(d[dateField], bounds) &&
      (filter.minValue == null || (d.value.amount ?? 0) >= filter.minValue)
  );

  const money = summarizeMoney(filtered);
  const caveats = moneyCaveats(money, "deals");

  // If a date filter was applied, note rows dropped for missing that date.
  if (bounds) {
    const missingDate = ds.deals.filter((d) => d[dateField] === null).length;
    if (missingDate > 0) {
      caveats.push(`${missingDate} deals have no ${dateField} and are excluded from this date-filtered view.`);
    }
  }

  const grouped = filter.groupBy
    ? groupBreakdown(filtered, filter.groupBy)
    : undefined;

  // When nothing matches, surface what DOES exist so the agent can guide the user
  // (e.g. "there's no Energy sector — did you mean Renewables?").
  const noMatchHint =
    filtered.length === 0
      ? { availableSectors: distinctValues(ds.deals, (d) => d.sector), availableStages: distinctValues(ds.deals, (d) => d.stage) }
      : undefined;

  return {
    summary: `${filtered.length} deals match; total value ${formatMoney(money.sum, money.currency)}, average ${formatMoney(money.avg, money.currency)}.`,
    data: {
      matchCount: filtered.length,
      totalValue: money.sum,
      totalValueDisplay: formatMoney(money.sum, money.currency),
      averageValue: money.avg,
      averageValueDisplay: formatMoney(money.avg, money.currency),
      currency: money.currency,
      appliedFilter: filter,
      breakdown: grouped,
      deals: filtered.slice(0, 50).map(slimDeal), // cap payload
      ...noMatchHint,
    },
    caveats,
  };
}

function groupBreakdown(deals: Deal[], groupBy: NonNullable<DealFilter["groupBy"]>) {
  const groups: Record<string, Deal[]> = {};
  for (const d of deals) {
    const k = (d[groupBy] as string | null) ?? "(unspecified)";
    (groups[k] ??= []).push(d);
  }
  return Object.entries(groups).map(([key, rows]) => {
    const m = summarizeMoney(rows);
    return { key, count: rows.length, totalValue: m.sum, totalValueDisplay: formatMoney(m.sum, m.currency), currency: m.currency };
  });
}

function slimDeal(d: Deal) {
  return {
    name: d.name,
    client: d.client,
    sector: d.sector,
    stage: d.stage,
    status: d.status,
    owner: d.owner,
    value: d.value.amount,
    valueDisplay: formatMoney(d.value.amount, d.value.currency),
    currency: d.value.currency,
    createdDate: d.createdDate,
    expectedCloseDate: d.expectedCloseDate,
  };
}

// ── Tool: query work orders ────────────────────────────────────────

export function queryWorkOrders(ds: Dataset, filter: WorkOrderFilter): ToolResult {
  const bounds = quarterBounds(filter.quarter, filter.year);
  const dateField = filter.dateField ?? "startDate";

  const filtered = ds.workOrders.filter(
    (w) =>
      matches(w.name, filter.name) &&
      matches(w.sector, filter.sector) &&
      matches(w.status, filter.status) &&
      matches(w.owner, filter.owner) &&
      matches(w.region, filter.region) &&
      matches(w.client, filter.client) &&
      inRange(w[dateField], bounds) &&
      (filter.minValue == null || (w.value.amount ?? 0) >= filter.minValue)
  );

  const money = summarizeMoney(filtered);
  const caveats = moneyCaveats(money, "work orders");

  const grouped = filter.groupBy
    ? Object.entries(groupCounts(filtered, (w) => w[filter.groupBy!] as string | null)).map(
        ([key, count]) => ({ key, count })
      )
    : undefined;

  // When nothing matches, surface the real status/sector vocabulary so the agent
  // can correct filters like status="active" (actual values are "Ongoing", etc.).
  const noMatchHint =
    filtered.length === 0
      ? { availableStatuses: distinctValues(ds.workOrders, (w) => w.status), availableSectors: distinctValues(ds.workOrders, (w) => w.sector) }
      : undefined;

  return {
    summary: `${filtered.length} work orders match; total value ${formatMoney(money.sum, money.currency)}.`,
    data: {
      matchCount: filtered.length,
      totalValue: money.sum,
      totalValueDisplay: formatMoney(money.sum, money.currency),
      currency: money.currency,
      appliedFilter: filter,
      breakdown: grouped,
      workOrders: filtered.slice(0, 50).map((w) => ({
        name: w.name,
        client: w.client,
        sector: w.sector,
        status: w.status,
        value: w.value.amount,
        valueDisplay: formatMoney(w.value.amount, w.value.currency),
        startDate: w.startDate,
        endDate: w.endDate,
      })),
      ...noMatchHint,
    },
    caveats,
  };
}

// ── Tool: cross-board ──────────────────────────────────────────────

const clientKey = (s: string | null) => (s ? s.toLowerCase().replace(/[^a-z0-9]/g, "") : "");

function groupByClient<T extends { client: string | null }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const k = clientKey(r.client);
    if (!k) continue;
    const bucket = map.get(k) ?? [];
    bucket.push(r);
    map.set(k, bucket);
  }
  return map;
}

/** Join deals and work orders on normalized client name. */
export function crossBoard(ds: Dataset): ToolResult {
  const dealsByClient = groupByClient(ds.deals);
  const woByClient = groupByClient(ds.workOrders);

  const bothKeys = [...dealsByClient.keys()].filter((k) => woByClient.has(k));
  const overlap = bothKeys.map((k) => {
    const deals = dealsByClient.get(k)!;
    const wos = woByClient.get(k)!;
    return {
      client: deals[0].client,
      dealCount: deals.length,
      dealValue: summarizeMoney(deals).sum,
      workOrderCount: wos.length,
      workOrderValue: summarizeMoney(wos).sum,
    };
  });

  const caveats: string[] = [];
  const dealsNoClient = ds.deals.filter((d) => !d.client).length;
  const woNoClient = ds.workOrders.filter((w) => !w.client).length;
  if (dealsNoClient || woNoClient) {
    caveats.push(`${dealsNoClient} deals and ${woNoClient} work orders lack a client name and can't be matched across boards.`);
  }
  caveats.push("Matching is by normalized client name; spelling variants may under-count overlaps.");

  return {
    summary: `${overlap.length} clients appear in both boards.`,
    data: {
      clientsInBothCount: overlap.length,
      clientsInBoth: overlap,
      clientsOnlyInDeals: dealsByClient.size - overlap.length,
      clientsOnlyInWorkOrders: woByClient.size - overlap.length,
      totalDistinctDealClients: dealsByClient.size,
      totalDistinctWorkOrderClients: woByClient.size,
    },
    caveats,
  };
}
