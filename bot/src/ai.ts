import Anthropic from "@anthropic-ai/sdk";
import { claudeTools, isReportName } from "@/lib/reports-catalog";
import { renderReport } from "@/lib/bot-format";
import * as api from "./api";
import type { Identity } from "./api";

/**
 * Free-question answering via Claude tool-use (spec §5.1, §5.3): the model may
 * ONLY call whitelisted report tools — it never sees the DB, never writes SQL,
 * and must not guess. If no ANTHROPIC_API_KEY is configured the whole feature
 * degrades to null and the caller shows a polite fallback (same pattern as the
 * app's ai-client).
 */

const MODEL = process.env.BOT_AI_MODEL ?? "claude-sonnet-5";
const MAX_TURNS = 4;

const SYSTEM = [
  "Sen nashriyot ERP tizimining o'zbek tilidagi hisobot yordamchisisan.",
  "Faqat berilgan asboblar (report funksiyalari) orqali ma'lumot ol.",
  "QAT'IY QOIDA: faqat asbob qaytargan ma'lumotdagi raqamlarni ishlat.",
  "Ma'lumot yetarli bo'lmasa 'ma'lumot yetarli emas' deb ayt. Taxmin qilish TAQIQLANADI.",
  "Javob 3-8 jumlali, aniq va tahliliy bo'lsin. Raqamlarni o'zbekcha yoz.",
].join(" ");

export function aiEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * Answer a free-text question. Returns the analysis text, or null when AI is
 * disabled or fails (caller falls back to the menu).
 */
export async function answerQuestion(question: string, identity: NonNullable<Identity>): Promise<string | null> {
  if (!aiEnabled()) return null;
  const tools = claudeTools(identity.permissions);
  if (tools.length === 0) return null;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const resp = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM,
        tools: tools as Anthropic.Tool[],
        messages,
      });

      if (resp.stop_reason !== "tool_use") {
        return textOf(resp);
      }

      // Execute every tool the model requested, feeding results back.
      messages.push({ role: "assistant", content: resp.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of resp.content) {
        if (block.type !== "tool_use") continue;
        const name = block.name;
        const input = (block.input ?? {}) as Record<string, string | number>;
        let payload: string;
        if (!isReportName(name)) {
          payload = "Xato: noma'lum hisobot";
        } else {
          const r = await api.runReport(identity.userId, name, input);
          payload = r.error ? `Xato: ${r.error}` : JSON.stringify(r.data);
        }
        results.push({ type: "tool_result", tool_use_id: block.id, content: payload });
      }
      messages.push({ role: "user", content: results });
    }
    return "Ma'lumot yetarli emas.";
  } catch {
    return null;
  }
}

function textOf(resp: Anthropic.Message): string {
  return resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

// Re-export so index.ts can render menu-button reports with the same formatter.
export { renderReport };
