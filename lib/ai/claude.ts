import Anthropic from "@anthropic-ai/sdk";

/**
 * Thin server-to-server Claude client for the app's own AI features (M17 GEO).
 * Graceful degradation is the rule — no key, timeout, or any error returns null
 * so a page renders "AI mavjud emas" instead of crashing (same contract as
 * lib/ai-client.ts for the Python service). AI recommends; a human approves.
 */

const TIMEOUT_MS = 30_000;

// Read env at call time so config changes / tests take effect without a reimport.
const apiKey = () => process.env.ANTHROPIC_API_KEY;
const model = () => process.env.APP_AI_MODEL ?? "claude-opus-5";

export function claudeEnabled(): boolean {
  return !!apiKey();
}

/**
 * Ask Claude for a single JSON object described by `system` + `user`. Returns
 * the parsed JSON (unknown — the caller validates with Zod), or null when AI is
 * unavailable or the response can't be parsed as JSON.
 */
export async function generateJson(
  system: string,
  user: string,
  opts: { maxTokens?: number } = {},
): Promise<{ data: unknown; model: string } | null> {
  const key = apiKey();
  if (!key) return null;

  try {
    const client = new Anthropic({ apiKey: key, timeout: TIMEOUT_MS });
    const usedModel = model();
    const resp = await client.messages.create({
      model: usedModel,
      max_tokens: opts.maxTokens ?? 2048,
      system: `${system}\n\nFaqat bitta JSON obyekt qaytar. Boshqa matn, izoh yoki markdown yozma.`,
      messages: [{ role: "user", content: user }],
    });
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return { data: extractJson(text), model: usedModel };
  } catch {
    return null;
  }
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
