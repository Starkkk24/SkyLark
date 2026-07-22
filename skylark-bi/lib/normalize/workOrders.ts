import type { WorkOrder, MondayItem } from "@/lib/types";
import { cleanText, columnMap, dateFrom, indexById, moneyFrom, textFrom } from "@/lib/normalize/fields";
import { resolveColumns, type FieldAliases } from "@/lib/normalize/resolve";

/** Alias fragments used to fuzzy-match Work Order columns by title. */
const ALIASES: FieldAliases = {
  client: ["client", "account", "company", "customer", "custom"],
  sector: ["sector", "industry", "vertical", "domain"],
  status: ["status", "state", "stage", "progress", "execution"],
  owner: ["owner", "assigned", "engineer", "manager", "lead", "pilot", "operator", "technician", "personnel", "kam"],
  value: ["value", "amount", "cost", "budget", "price", "revenue", "billing"],
  start: ["start", "begin", "kickoff", "commence"],
  end: ["end", "due", "completion", "complete", "deadline", "finish", "delivery"],
  region: ["region", "location", "site", "geo", "area", "city", "territory"],
};

export function normalizeWorkOrders(items: MondayItem[], defaultCurrency: string): WorkOrder[] {
  const cols = resolveColumns(items, ALIASES);
  return items.map((item): WorkOrder => {
    const c = indexById(item);
    return {
      id: item.id,
      name: cleanText(item.name) ?? `Work Order ${item.id}`,
      client: textFrom(c, cols.client),
      sector: textFrom(c, cols.sector),
      status: textFrom(c, cols.status),
      owner: textFrom(c, cols.owner),
      value: moneyFrom(c, cols.value, defaultCurrency),
      startDate: dateFrom(c, cols.start).iso,
      endDate: dateFrom(c, cols.end).iso,
      region: textFrom(c, cols.region),
      raw: columnMap(item),
    };
  });
}

export { ALIASES as WORK_ORDER_ALIASES };
