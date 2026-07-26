import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { claudeTools, isReportName } from "@/lib/reports-catalog";
import { renderReport } from "@/lib/bot-format";
import * as api from "./api";
import type { Identity } from "./api";

/**
 * Free-question answering via LLM tool/function calling (spec §5.1, §5.3): the
 * model may ONLY call whitelisted report tools — it never sees the DB, never
 * writes SQL, and must not guess. Prefers Anthropic/Claude; falls back to OpenAI
 * function-calling when only OPENAI_API_KEY is set. Degrades to null (caller
 * shows the menu) when no key is configured or the call fails.
 */

const ANTHROPIC_MODEL = process.env.BOT_AI_MODEL ?? "claude-sonnet-5";
const OPENAI_MODEL = process.env.BOT_OPENAI_MODEL ?? "gpt-4o-mini";
const MAX_TURNS = 4;

const SYSTEM = [
  "Sen nashriyot ERP tizimining o'zbek tilidagi hisobot yordamchisisan.",
  "Faqat berilgan asboblar (report funksiyalari) orqali ma'lumot ol.",
  "QAT'IY QOIDA: faqat asbob qaytargan ma'lumotdagi raqamlarni ishlat.",
  "Ma'lumot yetarli bo'lmasa 'ma'lumot yetarli emas' deb ayt. Taxmin qilish TAQIQLANADI.",
  "Javob 3-8 jumlali, aniq va tahliliy bo'lsin. Raqamlarni o'zbekcha yoz.",
].join(" ");

const anthropicKey = () => process.env.ANTHROPIC_API_KEY;
const openaiKey = () => process.env.OPENAI_API_KEY;

export function aiEnabled(): boolean {
  return !!(anthropicKey() || openaiKey());
}

async function runReportTool(identity: NonNullable<Identity>, name: string, input: Record<string, unknown>): Promise<string> {
  if (!isReportName(name)) return "Xato: noma'lum hisobot";
  const r = await api.runReport(identity.userId, name, input as Record<string, string | number>);
  return r.error ? `Xato: ${r.error}` : JSON.stringify(r.data);
}

/** Answer a free-text question, or null when AI is disabled/fails. */
export async function answerQuestion(question: string, identity: NonNullable<Identity>): Promise<string | null> {
  const tools = claudeTools(identity.permissions);
  if (tools.length === 0) return null;
  if (anthropicKey()) return answerAnthropic(question, identity, tools);
  if (openaiKey()) return answerOpenAI(question, identity, tools);
  return null;
}

type Tool = { name: string; description: string; input_schema: Record<string, unknown> };

async function answerAnthropic(question: string, identity: NonNullable<Identity>, tools: Tool[]): Promise<string | null> {
  try {
    const client = new Anthropic({ apiKey: anthropicKey() });
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const resp = await client.messages.create({ model: ANTHROPIC_MODEL, max_tokens: 1024, system: SYSTEM, tools: tools as Anthropic.Tool[], messages });
      if (resp.stop_reason !== "tool_use") {
        return resp.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
      }
      messages.push({ role: "assistant", content: resp.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of resp.content) {
        if (block.type !== "tool_use") continue;
        const payload = await runReportTool(identity, block.name, (block.input ?? {}) as Record<string, unknown>);
        results.push({ type: "tool_result", tool_use_id: block.id, content: payload });
      }
      messages.push({ role: "user", content: results });
    }
    return "Ma'lumot yetarli emas.";
  } catch {
    return null;
  }
}

async function answerOpenAI(question: string, identity: NonNullable<Identity>, tools: Tool[]): Promise<string | null> {
  try {
    const client = new OpenAI({ apiKey: openaiKey() });
    const oaTools: OpenAI.Chat.Completions.ChatCompletionTool[] = tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.input_schema },
    }));
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM },
      { role: "user", content: question },
    ];
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const resp = await client.chat.completions.create({ model: OPENAI_MODEL, max_tokens: 1024, tools: oaTools, messages });
      const msg = resp.choices[0]?.message;
      if (!msg) return null;
      if (!msg.tool_calls || msg.tool_calls.length === 0) return (msg.content ?? "").trim();
      messages.push(msg);
      for (const call of msg.tool_calls) {
        if (call.type !== "function") continue;
        let input: Record<string, unknown> = {};
        try { input = JSON.parse(call.function.arguments || "{}"); } catch { input = {}; }
        const payload = await runReportTool(identity, call.function.name, input);
        messages.push({ role: "tool", tool_call_id: call.id, content: payload });
      }
    }
    return "Ma'lumot yetarli emas.";
  } catch {
    return null;
  }
}

// Re-export so index.ts can render menu-button reports with the same formatter.
export { renderReport };
