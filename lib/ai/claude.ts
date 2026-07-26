import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

/**
 * Provider-agnostic LLM client for the app's own AI features (M17 GEO).
 * Prefers Anthropic/Claude (the spec default); falls back to OpenAI when only
 * an OPENAI_API_KEY is configured. Graceful degradation is the rule — no key,
 * timeout, or any error returns null so a page renders "AI mavjud emas" instead
 * of crashing (same contract as lib/ai-client.ts). AI recommends; a human approves.
 */

const TIMEOUT_MS = 30_000;

// Read env at call time so config changes / tests take effect without a reimport.
const anthropicKey = () => process.env.ANTHROPIC_API_KEY;
const openaiKey = () => process.env.OPENAI_API_KEY;
const anthropicModel = () => process.env.APP_AI_MODEL ?? "claude-opus-5";
const openaiModel = () => process.env.OPENAI_MODEL ?? "gpt-4o-mini";

/** True when any LLM provider is configured. */
export function claudeEnabled(): boolean {
  return !!(anthropicKey() || openaiKey());
}

const JSON_INSTRUCTION = "Faqat bitta JSON obyekt qaytar. Boshqa matn, izoh yoki markdown yozma.";

/**
 * Ask the configured LLM for a single JSON object described by `system` + `user`.
 * Returns the parsed JSON (unknown — the caller validates with Zod) plus the
 * model used, or null when no provider is available / the reply isn't JSON.
 */
export async function generateJson(
  system: string,
  user: string,
  opts: { maxTokens?: number } = {},
): Promise<{ data: unknown; model: string } | null> {
  const maxTokens = opts.maxTokens ?? 2048;

  if (anthropicKey()) {
    try {
      const client = new Anthropic({ apiKey: anthropicKey(), timeout: TIMEOUT_MS });
      const model = anthropicModel();
      const resp = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: `${system}\n\n${JSON_INSTRUCTION}`,
        messages: [{ role: "user", content: user }],
      });
      const text = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      return { data: extractJson(text), model };
    } catch {
      return null;
    }
  }

  if (openaiKey()) {
    try {
      const client = new OpenAI({ apiKey: openaiKey(), timeout: TIMEOUT_MS });
      const model = openaiModel();
      const resp = await client.chat.completions.create({
        model,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `${system}\n\n${JSON_INSTRUCTION}` },
          { role: "user", content: user },
        ],
      });
      const text = (resp.choices[0]?.message?.content ?? "").trim();
      return { data: extractJson(text), model };
    } catch {
      return null;
    }
  }

  return null;
}

/** Pull the first JSON object out of a model reply (tolerates code fences). */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("JSON topilmadi");
  return JSON.parse(body.slice(start, end + 1));
}
