import type { Deal, MondayItem } from "@/lib/types";
import { cleanText, columnMap, dateFrom, indexById, moneyFrom, textFrom } from "@/lib/normalize/fields";
import { resolveColumns, type FieldAliases } from "@/lib/normalize/resolve";

/** Alias fragments used to fuzzy-match Deal columns by title. */
const ALIASES: FieldAliases = {
  client: ["client", "account", "company", "customer", "organis", "organiz"],
  sector: ["sector", "industry", "vertical", "domain"],
  stage: ["stage", "pipeline", "funnel"],
  status: ["status", "state"],
  owner: ["owner", "rep", "salesperson", "assigned", "manager", "bdm"],
  value: ["value", "amount", "dealsize", "revenue", "worth", "price", "contract", "acv", "tcv"],
  created: ["created", "createdate", "opendate", "dateadded"],
  close: ["close", "closing", "expected", "tentative", "targetdate"],
  region: ["region", "location", "geo", "country", "city", "area", "territory"],
};

export function normalizeDeals(items: MondayItem[], defaultCurrency: string): Deal[] {
  const cols = resolveColumns(items, ALIASES);
  return items.map((item): Deal => {
    const c = indexById(item);
    return {
      id: item.id,
      name: cleanText(item.name) ?? `Deal ${item.id}`,
      client: textFrom(c, cols.client),
      sector: textFrom(c, cols.sector),
      stage: textFrom(c, cols.stage),
      status: textFrom(c, cols.status),
      owner: textFrom(c, cols.owner),
      value: moneyFrom(c, cols.value, defaultCurrency),
      createdDate: dateFrom(c, cols.created).iso,
      expectedCloseDate: dateFrom(c, cols.close).iso,
      region: textFrom(c, cols.region),
      raw: columnMap(item),
    };
  });
}

export { ALIASES as DEAL_ALIASES };
