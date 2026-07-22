import type OpenAI from "openai";
import { z } from "zod";
import type { Dataset, ToolResult } from "@/lib/types";
import { crossBoard, getOverview, queryDeals, queryWorkOrders } from "@/lib/analytics";

/**
 * OpenAI tool schemas + a deterministic dispatcher. The LLM chooses a tool and
 * arguments; we validate the args and run real analytics. The model never does math.
 */

const dealFilterSchema = z.object({
  name: z.string().optional(),
  sector: z.string().optional(),
  stage: z.string().optional(),
  status: z.string().optional(),
  owner: z.string().optional(),
  region: z.string().optional(),
  client: z.string().optional(),
  dateField: z.enum(["createdDate", "expectedCloseDate"]).optional(),
  quarter: z.coerce.number().int().min(1).max(4).optional(),
  year: z.coerce.number().int().optional(),
  minValue: z.coerce.number().optional(),
  groupBy: z.enum(["sector", "stage", "status", "owner", "region"]).optional(),
});

const workOrderFilterSchema = z.object({
  name: z.string().optional(),
  sector: z.string().optional(),
  status: z.string().optional(),
  owner: z.string().optional(),
  region: z.string().optional(),
  client: z.string().optional(),
  dateField: z.enum(["startDate", "endDate"]).optional(),
  quarter: z.coerce.number().int().min(1).max(4).optional(),
  year: z.coerce.number().int().optional(),
  minValue: z.coerce.number().optional(),
  groupBy: z.enum(["sector", "status", "owner", "region"]).optional(),
});

export const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_overview",
      description:
        "High-level snapshot of BOTH boards: deal counts, total pipeline value, sector/stage breakdowns, work-order counts/statuses, and data-quality notes. Call this first for broad questions.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "query_deals",
      description:
        "Filter and aggregate the Deals board. Use for pipeline, revenue, sector performance, stage/owner analysis, OR to look up a specific deal by name. All string filters are case-insensitive 'contains' matches. Set groupBy to break totals down by a dimension. Quarters are calendar-based. If nothing matches, the result includes availableSectors/availableStages to guide the user.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "deal NAME, e.g. 'Naruto' — distinct from the masked client code" },
          sector: { type: "string", description: "e.g. 'mining', 'renewables'" },
          stage: { type: "string", description: "pipeline stage, e.g. 'negotiation'" },
          status: { type: "string" },
          owner: { type: "string" },
          region: { type: "string" },
          client: { type: "string" },
          dateField: {
            type: "string",
            enum: ["createdDate", "expectedCloseDate"],
            description: "which date the quarter/year filter applies to (default expectedCloseDate)",
          },
          quarter: { type: "integer", minimum: 1, maximum: 4 },
          year: { type: "integer" },
          minValue: { type: "number", description: "minimum deal value" },
          groupBy: { type: "string", enum: ["sector", "stage", "status", "owner", "region"] },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_work_orders",
      description:
        "Filter and aggregate the Work Orders board. Use for operational/execution metrics: active projects, completion status, work value by sector/region/owner, OR to look up a specific work order by name.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "work-order / deal NAME, e.g. 'Scooby-Doo'" },
          sector: { type: "string" },
          status: { type: "string", description: "e.g. 'in progress', 'completed'" },
          owner: { type: "string" },
          region: { type: "string" },
          client: { type: "string" },
          dateField: { type: "string", enum: ["startDate", "endDate"] },
          quarter: { type: "integer", minimum: 1, maximum: 4 },
          year: { type: "integer" },
          minValue: { type: "number" },
          groupBy: { type: "string", enum: ["sector", "status", "owner", "region"] },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cross_board",
      description:
        "Join Deals and Work Orders by client name. Use for questions spanning both boards, e.g. 'which clients have deals AND active work orders'.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
];

/** Validate args and run the matching analytics function. Never throws. */
export function runTool(name: string, rawArgs: unknown, ds: Dataset): ToolResult {
  try {
    switch (name) {
      case "get_overview":
        return getOverview(ds);
      case "query_deals":
        return queryDeals(ds, dealFilterSchema.parse(rawArgs ?? {}));
      case "query_work_orders":
        return queryWorkOrders(ds, workOrderFilterSchema.parse(rawArgs ?? {}));
      case "cross_board":
        return crossBoard(ds);
      default:
        return { summary: `Unknown tool: ${name}`, data: null, caveats: [] };
    }
  } catch (err) {
    return {
      summary: "Tool execution failed.",
      data: null,
      caveats: [`Could not run ${name}: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
}
