import { z } from "zod";

/**
 * Central, validated environment configuration.
 *
 * Validation is lazy (first `getConfig()` call) so `next build` never fails on
 * incomplete build-time env — the error surfaces at request time instead.
 *
 * The AI provider is swappable via AI_PROVIDER. Gemini, OpenAI and Groq are all
 * driven through the OpenAI SDK (Gemini/Groq via their OpenAI-compatible
 * endpoints), so only the base URL / key / model differ.
 */
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

const envSchema = z
  .object({
    MONDAY_TOKEN: z.string().min(1, "MONDAY_TOKEN is required"),
    MONDAY_DEALS_BOARD_ID: z.string().min(1, "MONDAY_DEALS_BOARD_ID is required"),
    MONDAY_WORKORDERS_BOARD_ID: z.string().min(1, "MONDAY_WORKORDERS_BOARD_ID is required"),

    AI_PROVIDER: z.enum(["gemini", "openai", "groq", "custom"]).default("gemini"),
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_MODEL: z.string().min(1).default("gemini-2.0-flash"),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_MODEL: z.string().min(1).default("gpt-4o-mini"),
    GROQ_API_KEY: z.string().optional(),
    GROQ_MODEL: z.string().min(1).default("llama-3.3-70b-versatile"),

    // "custom" = any OpenAI-compatible endpoint (OpenRouter, Cerebras, GitHub Models, …)
    AI_BASE_URL: z.string().optional(),
    AI_API_KEY: z.string().optional(),
    AI_MODEL: z.string().optional(),

    DEFAULT_CURRENCY: z.string().min(1).default("INR"),
  })
  .superRefine((env, ctx) => {
    if (env.AI_PROVIDER === "custom") {
      const missing = [
        !env.AI_BASE_URL && "AI_BASE_URL",
        !env.AI_API_KEY && "AI_API_KEY",
        !env.AI_MODEL && "AI_MODEL",
      ].filter(Boolean);
      for (const m of missing) {
        ctx.addIssue({ code: "custom", message: `${m} is required when AI_PROVIDER=custom`, path: [m as string] });
      }
      return;
    }
    const need: Record<string, string | undefined> = {
      gemini: env.GEMINI_API_KEY,
      openai: env.OPENAI_API_KEY,
      groq: env.GROQ_API_KEY,
    };
    if (!need[env.AI_PROVIDER]) {
      const keyName = `${env.AI_PROVIDER.toUpperCase()}_API_KEY`;
      ctx.addIssue({ code: "custom", message: `${keyName} is required when AI_PROVIDER=${env.AI_PROVIDER}`, path: [keyName] });
    }
  });

type Env = z.infer<typeof envSchema>;

export interface AiSettings {
  provider: "gemini" | "openai" | "groq" | "custom";
  apiKey: string;
  model: string;
  baseURL?: string; // undefined → OpenAI default
}

export interface AppConfig {
  MONDAY_TOKEN: string;
  MONDAY_DEALS_BOARD_ID: string;
  MONDAY_WORKORDERS_BOARD_ID: string;
  DEFAULT_CURRENCY: string;
  ai: AiSettings;
}

function toAiSettings(env: Env): AiSettings {
  switch (env.AI_PROVIDER) {
    case "openai":
      return { provider: "openai", apiKey: env.OPENAI_API_KEY!, model: env.OPENAI_MODEL };
    case "groq":
      return { provider: "groq", apiKey: env.GROQ_API_KEY!, model: env.GROQ_MODEL, baseURL: GROQ_BASE_URL };
    case "custom":
      return { provider: "custom", apiKey: env.AI_API_KEY!, model: env.AI_MODEL!, baseURL: env.AI_BASE_URL! };
    default:
      return { provider: "gemini", apiKey: env.GEMINI_API_KEY!, model: env.GEMINI_MODEL, baseURL: GEMINI_BASE_URL };
  }
}

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration — ${problems}. See .env.example.`);
  }

  const env = parsed.data;
  cached = {
    MONDAY_TOKEN: env.MONDAY_TOKEN,
    MONDAY_DEALS_BOARD_ID: env.MONDAY_DEALS_BOARD_ID,
    MONDAY_WORKORDERS_BOARD_ID: env.MONDAY_WORKORDERS_BOARD_ID,
    DEFAULT_CURRENCY: env.DEFAULT_CURRENCY,
    ai: toAiSettings(env),
  };
  return cached;
}

/** Test/refresh helper — clears the memoized config. */
export function resetConfigCache(): void {
  cached = null;
}
