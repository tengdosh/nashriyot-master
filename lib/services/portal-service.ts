import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Author portal (spec v1 §5.7). EVERY query here takes a `contributorId` and
 * filters to it — row-level isolation is enforced in the query, never in the UI.
 * The portal only ever shows SENT royalty periods; DRAFT/APPROVED runs are
 * internal and invisible to authors.
 */

export class PortalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortalError";
  }
}

/** SENT is the only status an author may see (spec §5.7). */
const VISIBLE_RUN = { status: "SENT" as const };

export type PortalOverview = {
  totalNetUnits: number;
  totalEarned: Prisma.Decimal;
  totalPaid: Prisma.Decimal;
  reserveHeld: Prisma.Decimal;
  advanceAmount: Prisma.Decimal;
  advanceRecouped: Prisma.Decimal;
  advanceOutstanding: Prisma.Decimal;
  advanceProgress: number; // 0..1 recouped share, for the progress bar
  monthly: { month: string; earned: number; payable: number }[];
  periods: number;
};

export async function portalOverview(contributorId: string): Promise<PortalOverview> {
  const [statements, contracts] = await Promise.all([
    prisma.royaltyStatement.findMany({
      where: { contract: { contributorId }, run: VISIBLE_RUN },
      include: { run: { select: { period: true, periodEnd: true } } },
      orderBy: { run: { periodEnd: "asc" } },
    }),
    prisma.contract.findMany({
      where: { contributorId, archivedAt: null },
      select: { advanceAmount: true },
    }),
  ]);

  const zero = new Prisma.Decimal(0);
  const totalEarned = statements.reduce((a, s) => a.plus(s.earned), zero);
  const totalPaid = statements.reduce((a, s) => a.plus(s.payable), zero);
  const reserveHeld = statements.reduce((a, s) => a.plus(s.reserveHeld), zero);
  const advanceRecouped = statements.reduce((a, s) => a.plus(s.advanceRecouped), zero);
  const advanceAmount = contracts.reduce((a, c) => a.plus(c.advanceAmount), zero);
  const advanceOutstanding = Prisma.Decimal.max(advanceAmount.minus(advanceRecouped), 0);

  const monthly = statements.map((s) => ({
    month: s.run.period,
    earned: Number(s.earned),
    payable: Number(s.payable),
  }));

  return {
    totalNetUnits: statements.reduce((a, s) => a + s.netUnits, 0),
    totalEarned,
    totalPaid,
    reserveHeld,
    advanceAmount,
    advanceRecouped,
    advanceOutstanding,
    advanceProgress: advanceAmount.gt(0) ? advanceRecouped.div(advanceAmount).toNumber() : 1,
    monthly,
    periods: statements.length,
  };
}

export type PortalStatement = {
  id: string;
  period: string;
  workTitle: string;
  netUnits: number;
  earned: number;
  reserveHeld: number;
  reserveReleased: number;
  advanceRecouped: number;
  payable: number;
  sentAt: string | null;
  detail: unknown;
};

/** SENT statements for this contributor only, newest first. */
export async function portalStatements(contributorId: string): Promise<PortalStatement[]> {
  const rows = await prisma.royaltyStatement.findMany({
    where: { contract: { contributorId }, run: VISIBLE_RUN },
    include: {
      run: { select: { period: true, sentAt: true } },
      contract: { select: { title: { select: { workTitle: true } } } },
    },
    orderBy: { run: { periodEnd: "desc" } },
  });

  return rows.map((s) => ({
    id: s.id,
    period: s.run.period,
    workTitle: s.contract.title?.workTitle ?? "—",
    netUnits: s.netUnits,
    earned: Number(s.earned),
    reserveHeld: Number(s.reserveHeld),
    reserveReleased: Number(s.reserveReleased),
    advanceRecouped: Number(s.advanceRecouped),
    payable: Number(s.payable),
    sentAt: s.run.sentAt?.toISOString() ?? null,
    detail: s.detail,
  }));
}

export type PortalBook = {
  titleId: string;
  workTitle: string;
  role: string;
  shareRate: number | null;
  contractType: string | null;
  lifetimeNetUnits: number;
};

/**
 * "Kitoblarim": titles this contributor is credited on. Lifetime net units come
 * from SENT statements only — an author never sees pre-publication or unsent
 * figures.
 */
export async function portalBooks(contributorId: string): Promise<PortalBook[]> {
  const credits = await prisma.titleContributor.findMany({
    where: { contributorId, title: { archivedAt: null } },
    include: { title: { select: { id: true, workTitle: true } } },
  });

  return Promise.all(
    credits.map(async (c) => {
      const agg = await prisma.royaltyStatement.aggregate({
        where: {
          contract: { contributorId, titleId: c.titleId },
          run: VISIBLE_RUN,
        },
        _sum: { netUnits: true },
      });
      const contract = await prisma.contract.findFirst({
        where: { contributorId, titleId: c.titleId, archivedAt: null },
        select: { type: true },
      });
      return {
        titleId: c.titleId,
        workTitle: c.title.workTitle,
        role: c.role,
        shareRate: c.shareRate != null ? Number(c.shareRate) : null,
        contractType: contract?.type ?? null,
        lifetimeNetUnits: agg._sum.netUnits ?? 0,
      };
    }),
  );
}

/**
 * Fetch a single statement, re-checking it belongs to the contributor and its
 * run is SENT. This is the authoritative access check — the download route and
 * any detail view go through it, never trusting a client-supplied id alone.
 */
export async function portalStatementForContributor(statementId: string, contributorId: string) {
  const s = await prisma.royaltyStatement.findFirst({
    where: { id: statementId, contract: { contributorId }, run: VISIBLE_RUN },
    include: {
      run: { select: { period: true, periodStart: true, periodEnd: true, sentAt: true } },
      contract: {
        select: {
          type: true,
          reserveRate: true,
          contributor: { select: { fullName: true } },
          title: { select: { workTitle: true } },
        },
      },
    },
  });
  if (!s) {
    // Same error whether the statement is another author's, unsent, or missing —
    // no information leaks about which.
    throw new PortalError("Hisobot topilmadi yoki sizga tegishli emas");
  }
  return s;
}

// ── Signed download tokens ────────────────────────────────────────────────────

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET qiymati o'rnatilmagan — server sozlamalarini tekshiring");
  return s;
}

/**
 * A time-limited, tamper-evident token binding a statement to ONE contributor.
 * The download route verifies the signature AND re-runs the DB ownership check,
 * so a forged or leaked link still cannot cross authors or outlive its window.
 */
export function signReportToken(
  statementId: string,
  contributorId: string,
  now: number = Date.now(),
  ttlMs = 15 * 60_000,
): string {
  const exp = now + ttlMs;
  const payload = `${statementId}.${contributorId}.${exp}`;
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

export type VerifiedToken = { statementId: string; contributorId: string; exp: number };

/** Returns the payload if the signature is valid and unexpired, else null. */
export function verifyReportToken(token: string, now: number = Date.now()): VerifiedToken | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  let payload: string;
  try {
    payload = Buffer.from(payloadB64, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const [statementId, contributorId, expStr] = payload.split(".");
  const exp = Number(expStr);
  if (!statementId || !contributorId || !Number.isFinite(exp)) return null;
  if (now > exp) return null;
  return { statementId, contributorId, exp };
}
