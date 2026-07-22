import { NextResponse } from "next/server";
import { buildDataset } from "@/lib/data/dataset";
import { getOverview } from "@/lib/analytics";
import { MondayError } from "@/lib/monday/client";

/**
 * Smoke-test endpoint (GET /api/debug): proves the live Monday fetch,
 * pagination, normalization, and quality assessment without the LLM.
 * Safe to keep — read-only, returns no secrets.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ds = await buildDataset();
    return NextResponse.json({
      ok: true,
      fetchedAt: ds.fetchedAt,
      counts: { deals: ds.deals.length, workOrders: ds.workOrders.length },
      quality: ds.quality,
      overview: getOverview(ds).data,
      sampleDeal: ds.deals[0] ?? null,
      sampleWorkOrder: ds.workOrders[0] ?? null,
    });
  } catch (err) {
    const status = err instanceof MondayError ? 502 : 500;
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status }
    );
  }
}
