import { NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { buildDataset } from "@/lib/data/dataset";
import { runAgent, type ChatMessage } from "@/lib/ai/orchestrator";
import { MondayError } from "@/lib/monday/client";

// Always run live (no static caching); allow time for Monday fetch + LLM.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .min(1),
});

export async function POST(req: Request) {
  // 1. Validate input
  let messages: ChatMessage[];
  try {
    const json = await req.json();
    messages = bodySchema.parse(json).messages;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // 2. Fetch live data + run the agent
  try {
    const dataset = await buildDataset();
    const reply = await runAgent(messages, dataset);
    return NextResponse.json({
      reply,
      meta: {
        fetchedAt: dataset.fetchedAt,
        deals: dataset.deals.length,
        workOrders: dataset.workOrders.length,
      },
    });
  } catch (err) {
    if (err instanceof MondayError) {
      return NextResponse.json({ error: `Data source error: ${err.message}` }, { status: 502 });
    }
    if (err instanceof OpenAI.APIError) {
      if (err.status === 429) {
        return NextResponse.json(
          { error: "AI provider quota/rate limit reached. Check your API plan or try again shortly." },
          { status: 429 }
        );
      }
      if (err.status === 401 || err.status === 403) {
        return NextResponse.json(
          { error: "AI provider rejected the API key. Verify AI_PROVIDER and the matching key." },
          { status: 502 }
        );
      }
      return NextResponse.json({ error: `AI provider error (${err.status}).` }, { status: 502 });
    }
    if (err instanceof Error && err.message.includes("environment configuration")) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    console.error("[/api/chat] unexpected error:", err);
    return NextResponse.json(
      { error: "Something went wrong while analyzing the data. Please try again." },
      { status: 500 }
    );
  }
}
