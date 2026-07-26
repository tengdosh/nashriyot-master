import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { hasValidServiceToken } from "@/lib/reports-auth";
import { linkChat, unlinkChat, setSubscriptions, TelegramError } from "@/lib/services/telegram-service";

const linkSchema = z.object({ chatId: z.string().min(1), code: z.string().regex(/^\d{6}$/, "6 xonali kod") });
const unlinkSchema = z.object({ chatId: z.string().min(1), action: z.literal("unlink") });
const subSchema = z.object({ chatId: z.string().min(1), action: z.literal("subscribe"), subscriptions: z.unknown() });

/**
 * Bot-only endpoint (Bearer REPORTS_API_TOKEN). Handles /ulash (link), /uzish
 * (unlink) and /obuna (subscribe). The acting user is decided by the code, not
 * by the token — the token merely proves the caller is the bot.
 */
export async function POST(req: NextRequest) {
  if (!hasValidServiceToken(req)) {
    return NextResponse.json({ data: null, error: "Token yaroqsiz" }, { status: 401 });
  }
  try {
    const body = await req.json();
    if (body?.action === "unlink") {
      const { chatId } = unlinkSchema.parse(body);
      const removed = await unlinkChat(chatId);
      return NextResponse.json({ data: { removed } });
    }
    if (body?.action === "subscribe") {
      const { chatId, subscriptions } = subSchema.parse(body);
      await setSubscriptions(chatId, subscriptions);
      return NextResponse.json({ data: { ok: true } });
    }
    const { chatId, code } = linkSchema.parse(body);
    const identity = await linkChat(chatId, code);
    return NextResponse.json({ data: identity });
  } catch (e) {
    if (e instanceof TelegramError) return NextResponse.json({ data: null, error: e.message }, { status: 400 });
    const message = e instanceof Error ? e.message : "Server xatosi";
    return NextResponse.json({ data: null, error: message }, { status: 400 });
  }
}
