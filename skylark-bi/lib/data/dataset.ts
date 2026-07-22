import { getConfig } from "@/lib/config";
import { fetchBoards } from "@/lib/monday/client";
import { normalizeDeals } from "@/lib/normalize/deals";
import { normalizeWorkOrders } from "@/lib/normalize/workOrders";
import { assessDeals, assessWorkOrders } from "@/lib/normalize/quality";
import type { Dataset } from "@/lib/types";

/**
 * Live per-request pipeline: fetch both boards from monday.com → normalize →
 * assess quality. No cache — every call returns fresh data (Vercel-serverless
 * friendly, no stale-state class of bugs).
 */
export async function buildDataset(): Promise<Dataset> {
  const { DEFAULT_CURRENCY } = getConfig();
  const { dealsRaw, workOrdersRaw } = await fetchBoards();

  const deals = normalizeDeals(dealsRaw, DEFAULT_CURRENCY);
  const workOrders = normalizeWorkOrders(workOrdersRaw, DEFAULT_CURRENCY);

  return {
    deals,
    workOrders,
    quality: {
      deals: assessDeals(deals),
      workOrders: assessWorkOrders(workOrders),
    },
    fetchedAt: new Date().toISOString(),
  };
}
