import OpenAI from "openai";
import { getConfig } from "@/lib/config";
import type { Dataset } from "@/lib/types";
import { TOOLS, runTool } from "@/lib/ai/tools";
import { buildSystemPrompt } from "@/lib/ai/prompts";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const MAX_TURNS = 6; // safety cap on the tool-calling loop

/**
 * Run the agent for one user turn. Given conversation history + a freshly built
 * dataset, drives the OpenAI tool-calling loop and returns the assistant's reply.
 */
export async function runAgent(history: ChatMessage[], ds: Dataset): Promise<string> {
  const { ai, DEFAULT_CURRENCY } = getConfig();
  const client = new OpenAI({ apiKey: ai.apiKey, baseURL: ai.baseURL });
  const today = new Date().toISOString().slice(0, 10);

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt({ currency: DEFAULT_CURRENCY, today }) },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await client.chat.completions.create({
      model: ai.model,
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      temperature: 0.2,
    });

    const msg = res.choices[0]?.message;
    if (!msg) return "Sorry, I couldn't generate a response.";
    messages.push(msg);

    const toolCalls = msg.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return msg.content ?? "";
    }

    for (const call of toolCalls) {
      if (call.type !== "function") continue;
      let args: unknown = {};
      try {
        args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        /* leave args as {} — runTool will validate/handle */
      }
      const result = runTool(call.function.name, args, ds);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }

  return "I gathered some data but couldn't finish the analysis — could you rephrase or narrow the question?";
}
