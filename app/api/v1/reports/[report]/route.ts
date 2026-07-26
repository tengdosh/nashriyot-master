import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { runReport, ReportError } from "@/lib/services/reports-service";
import { resolveReportCaller } from "@/lib/reports-auth";

/**
 * GET /api/v1/reports/:report — a single whitelisted report.
 * Params come from the query string; response is { data, generatedAt, params }
 * (playbook). Auth: Bearer REPORTS_API_TOKEN + x-user-id, or session+reports.read.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ report: string }> }) {
  try {
    const { report } = await ctx.params;
    const caller = await resolveReportCaller(req);

    // Query string → params object; `n` is coerced to a number for top-titles.
    const raw: Record<string, unknown> = {};
    req.nextUrl.searchParams.forEach((v, k) => {
      raw[k] = k === "n" ? Number(v) : v;
    });

    const { data, params, generatedAt } = await runReport(report, raw, caller);
    return NextResponse.json({ data, generatedAt, params });
  } catch (e) {
    if (e instanceof ReportError) {
      return NextResponse.json({ data: null, error: e.message }, { status: e.status });
    }
    if (e instanceof ZodError) {
      return NextResponse.json({ data: null, error: e.issues.map((i) => i.message).join("; ") }, { status: 400 });
    }
    const message = e instanceof Error ? e.message : "Server xatosi";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
