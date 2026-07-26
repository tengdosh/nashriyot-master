import { NextResponse, type NextRequest } from "next/server";
import { hasValidServiceToken } from "@/lib/reports-auth";
import { chatIdentity } from "@/lib/services/telegram-service";

/**
 * GET /api/v1/telegram/me?chatId= — resolve who a chat is + their permitted
 * menu (null if the chat is not linked). Bot-only (Bearer REPORTS_API_TOKEN).
 */
export async function GET(req: NextRequest) {
  if (!hasValidServiceToken(req)) {
    return NextResponse.json({ data: null, error: "Token yaroqsiz" }, { status: 401 });
  }
  const chatId = req.nextUrl.searchParams.get("chatId");
  if (!chatId) return NextResponse.json({ data: null, error: "chatId majburiy" }, { status: 400 });
  const identity = await chatIdentity(chatId);
  return NextResponse.json({ data: identity });
}
