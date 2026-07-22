import type { BoardQuality, Deal, FieldQuality, WorkOrder } from "@/lib/types";

/**
 * Assess data quality on the CLEANED entities. "missing" counts nulls (values
 * that were absent, placeholders, or unparseable → normalized to null). These
 * feed user-facing caveats like "3 deals are missing expected close dates".
 */

function fieldQuality<T>(
  rows: T[],
  field: string,
  isMissing: (row: T) => boolean
): FieldQuality {
  const missing = rows.reduce((n, r) => (isMissing(r) ? n + 1 : n), 0);
  return { field, total: rows.length, missing, invalid: 0 };
}

function currencyNote(amounts: { currency: string; amount: number | null }[]): string | null {
  const present = amounts.filter((m) => m.amount !== null);
  const currencies = new Set(present.map((m) => m.currency));
  if (currencies.size > 1) {
    return `Values use mixed currencies (${[...currencies].join(", ")}); totals across them may not be directly comparable.`;
  }
  return null;
}

function buildNotes(total: number, fields: FieldQuality[], extra: (string | null)[]): string[] {
  const notes: string[] = [];
  for (const f of fields) {
    if (f.missing > 0) {
      const pct = total ? Math.round((f.missing / total) * 100) : 0;
      notes.push(`${f.missing}/${total} (${pct}%) rows missing ${f.field}.`);
    }
  }
  for (const e of extra) if (e) notes.push(e);
  return notes;
}

export function assessDeals(deals: Deal[]): BoardQuality {
  const fields: FieldQuality[] = [
    fieldQuality(deals, "sector", (d) => d.sector === null),
    fieldQuality(deals, "stage", (d) => d.stage === null),
    fieldQuality(deals, "value", (d) => d.value.amount === null),
    fieldQuality(deals, "expected close date", (d) => d.expectedCloseDate === null),
    fieldQuality(deals, "owner", (d) => d.owner === null),
    fieldQuality(deals, "client", (d) => d.client === null),
  ];
  return {
    board: "deals",
    totalRows: deals.length,
    fields,
    notes: buildNotes(deals.length, fields, [currencyNote(deals.map((d) => d.value))]),
  };
}

export function assessWorkOrders(workOrders: WorkOrder[]): BoardQuality {
  const fields: FieldQuality[] = [
    fieldQuality(workOrders, "sector", (w) => w.sector === null),
    fieldQuality(workOrders, "status", (w) => w.status === null),
    fieldQuality(workOrders, "value", (w) => w.value.amount === null),
    fieldQuality(workOrders, "start date", (w) => w.startDate === null),
    fieldQuality(workOrders, "end date", (w) => w.endDate === null),
    fieldQuality(workOrders, "client", (w) => w.client === null),
  ];
  return {
    board: "workOrders",
    totalRows: workOrders.length,
    fields,
    notes: buildNotes(workOrders.length, fields, [currencyNote(workOrders.map((w) => w.value))]),
  };
}
