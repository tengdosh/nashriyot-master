import { NextResponse, type NextRequest } from "next/server";
import { hasValidServiceToken } from "@/lib/reports-auth";
import { pendingPushes } from "@/lib/services/telegram-service";

/**
 * GET /api/v1/telegram/pushes?since=<iso> — per-chat pending push notifications
 * (playbook §5.2). Bot-only (Bearer REPORTS_API_TOKEN). The bot polls this on an
 * interval and dedupes by notification id.
 */
export async function GET(req: NextRequest) {
  if (!hasValidServiceToken(req)) {
    return NextResponse.json({ data: null, error: "Token yaroqsiz" }, { status: 401 });
  }
  const since = req.nextUrl.searchParams.get("since") ?? undefined;
  const data = await pendingPushes(since);
  return NextResponse.json({ data, generatedAt: new Date().toISOString() });
}
