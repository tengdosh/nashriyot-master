import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import {
  portalStatementForContributor,
  verifyReportToken,
  PortalError,
} from "@/lib/services/portal-service";
import { formatUZS } from "@/lib/format";

/**
 * Signed statement download (spec v1 §5.7: "imzolangan URL").
 *
 * Two independent gates:
 *   1. The HMAC token must be valid and unexpired (tamper-evident, time-limited).
 *   2. The statement must STILL belong to the token's contributor and its run
 *      must be SENT — re-checked in the DB, so a leaked or forged link can never
 *      reach another author's data or an unsent period.
 *
 * PDF rendering is deferred; the body is a plain-text statement built entirely
 * from the SEALED figures, so it always matches what the author saw on screen.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const token = req.nextUrl.searchParams.get("token");

  if (!token) return text("Havola imzosi yoʻq", 401);
  const verified = verifyReportToken(token);
  if (!verified) return text("Havola imzosi notoʻgʻri yoki muddati oʻtgan", 401);
  // The token is for a specific statement — a token for one cannot open another.
  if (verified.statementId !== id) return text("Havola bu hisobotga tegishli emas", 403);

  let s: Awaited<ReturnType<typeof portalStatementForContributor>>;
  try {
    s = await portalStatementForContributor(id, verified.contributorId);
  } catch (e) {
    if (e instanceof PortalError) return text(e.message, 404);
    throw e;
  }

  const body = renderStatement(s);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="royalti-${s.run.period}.txt"`,
      "Cache-Control": "no-store",
    },
  });
}

function text(message: string, status: number) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

type StatementWithRelations = Awaited<ReturnType<typeof portalStatementForContributor>>;

function renderStatement(s: StatementWithRelations): string {
  const detail = s.detail as {
    byFormat?: { format: string; netUnits: number; tiers: { explain: string }[] }[];
  } | null;

  const lines: string[] = [
    "ROYALTI HISOBOTI",
    "═".repeat(48),
    `Muallif:   ${s.contract.contributor.fullName}`,
    `Asar:      ${s.contract.title?.workTitle ?? "—"}`,
    `Davr:      ${s.run.period} (${s.run.periodStart.toISOString().slice(0, 10)} – ${s.run.periodEnd.toISOString().slice(0, 10)})`,
    `Yuborilgan: ${s.run.sentAt?.toISOString().slice(0, 10) ?? "—"}`,
    "",
    `Sof nusxa: ${s.netUnits}  (sotilgan ${s.unitsSold} − qaytgan ${s.returnedUnits})`,
    `Umrbod oʻqda oldingi: ${s.cumulativeBefore}`,
    "",
    "TIER BOʻYICHA HISOB",
    "─".repeat(48),
  ];

  for (const f of detail?.byFormat ?? []) {
    lines.push(`  ${f.format} — ${f.netUnits} sof nusxa`);
    for (const t of f.tiers) lines.push(`    • ${t.explain}`);
  }

  const money = (v: Prisma.Decimal.Value) => formatUZS(new Prisma.Decimal(v).toNumber());
  lines.push(
    "",
    "YAKUNIY HISOB",
    "─".repeat(48),
    `  Hisoblangan royalti:   ${money(s.earned)}`,
    `  Ushlangan zaxira:    − ${money(s.reserveHeld)}`,
    `  Ochilgan zaxira:     + ${money(s.reserveReleased)}`,
    `  Avansdan qoplangan:  − ${money(s.advanceRecouped)}`,
    `  Qolgan avans:          ${money(s.advanceOutstanding)}`,
    "  " + "═".repeat(46),
    `  TOʻLANADIGAN:          ${money(s.payable)}`,
    "",
    "Bu hisobot muhrlangan maʼlumotlardan tuzilgan va oʻzgarmasdir.",
  );

  return lines.join("\n");
}
