import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runWithAudit } from "@/lib/audit-context";
import { assertDifferentApprover } from "@/lib/maker-checker";
import {
  assertPeriodClosed,
  buildStatement,
  explainTierLine,
  parsePeriod,
  type PeriodWindow,
  type TierInput,
} from "@/lib/royalty";
import { advanceOutstanding } from "./contract-service";

/**
 * Deterministic royalty engine (spec v1 §6.5).
 *
 * Three rules keep it deterministic:
 *   1. It reads ONLY sealed sales lines whose order shipped inside a CLOSED
 *      period — never a live recomputation, never a mid-period number.
 *   2. The cumulative tier position is derived from sealed sales BEFORE the
 *      period, not from prior statements. So a period that was never run still
 *      counts toward the ladder, and re-running yields the same answer.
 *   3. Once a run is approved the period is SEALED: no re-run, no late edits.
 */

export class RoyaltyRunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoyaltyRunError";
  }
}

type SoldGroup = {
  format: string;
  unitsSold: number;
  returnedUnits: number;
  listUnit: Prisma.Decimal;
  netUnit: Prisma.Decimal;
};

/**
 * Sealed period sales for one title, grouped by format. `netUnit` is the
 * quantity-weighted average of the SEALED net unit prices, so a NET-basis tier
 * is rated on money we actually received.
 */
async function soldByFormat(titleId: string, window: PeriodWindow): Promise<SoldGroup[]> {
  const lines = await prisma.salesOrderLine.findMany({
    where: {
      product: { titleId },
      order: {
        status: { in: ["SHIPPED", "INVOICED", "PAID"] },
        shippedDate: { gte: window.start, lte: window.end },
      },
    },
    select: {
      qty: true,
      unitPrice: true,
      discountRate: true,
      product: { select: { format: true, listPrice: true } },
      order: { select: { channel: { select: { feeRate: true } } } },
      // Only returns booked inside the period reduce this period's net units.
      returns: { where: { date: { gte: window.start, lte: window.end } }, select: { qty: true } },
    },
  });

  const byFormat = new Map<string, { units: number; returned: number; netMoney: Prisma.Decimal; listMoney: Prisma.Decimal }>();
  for (const l of lines) {
    const fee = new Prisma.Decimal(l.order.channel.feeRate);
    const netUnit = new Prisma.Decimal(l.unitPrice)
      .times(new Prisma.Decimal(1).minus(l.discountRate))
      .times(new Prisma.Decimal(1).minus(fee));
    const returned = l.returns.reduce((a, r) => a + r.qty, 0);
    const key = l.product.format;
    const e = byFormat.get(key) ?? {
      units: 0,
      returned: 0,
      netMoney: new Prisma.Decimal(0),
      listMoney: new Prisma.Decimal(0),
    };
    e.units += l.qty;
    e.returned += returned;
    e.netMoney = e.netMoney.plus(netUnit.times(l.qty));
    e.listMoney = e.listMoney.plus(new Prisma.Decimal(l.product.listPrice).times(l.qty));
    byFormat.set(key, e);
  }

  return [...byFormat.entries()].map(([format, e]) => ({
    format,
    unitsSold: e.units,
    returnedUnits: e.returned,
    listUnit: e.units > 0 ? e.listMoney.div(e.units) : new Prisma.Decimal(0),
    netUnit: e.units > 0 ? e.netMoney.div(e.units) : new Prisma.Decimal(0),
  }));
}

/**
 * Lifetime net units for a title+format shipped BEFORE the period — the tier
 * position this period starts from. Derived from sales, not from statements.
 */
async function cumulativeBefore(titleId: string, format: string, window: PeriodWindow): Promise<number> {
  const lines = await prisma.salesOrderLine.findMany({
    where: {
      product: { titleId, format: format as Prisma.EnumProductFormatFilter["equals"] },
      order: {
        status: { in: ["SHIPPED", "INVOICED", "PAID"] },
        shippedDate: { lt: window.start },
      },
    },
    select: { qty: true, returns: { where: { date: { lt: window.start } }, select: { qty: true } } },
  });
  return lines.reduce((a, l) => a + l.qty - l.returns.reduce((b, r) => b + r.qty, 0), 0);
}

/**
 * Returns booked THIS period against copies shipped in an EARLIER period — the
 * cost the previous period's reserve was held against.
 *
 * Valued at the effective royalty rate of the previous statement
 * (earned ÷ netUnits). Exact per-tier attribution of a late return is not
 * recoverable from the data, and the effective rate is the honest, deterministic
 * approximation; it only ever affects how much reserve is FREED, never earnings.
 */
async function actualReturnImpact(
  contractId: string,
  titleId: string,
  window: PeriodWindow,
): Promise<Prisma.Decimal> {
  const lateReturns = await prisma.return.findMany({
    where: {
      date: { gte: window.start, lte: window.end },
      orderLine: {
        product: { titleId },
        order: { shippedDate: { lt: window.start } },
      },
    },
    select: { qty: true },
  });
  const units = lateReturns.reduce((a, r) => a + r.qty, 0);
  if (units === 0) return new Prisma.Decimal(0);

  const previous = await prisma.royaltyStatement.findFirst({
    where: { contractId, run: { status: { in: ["APPROVED", "SENT"] } } },
    orderBy: { run: { periodEnd: "desc" } },
    select: { earned: true, netUnits: true },
  });
  if (!previous || previous.netUnits === 0) return new Prisma.Decimal(0);

  const effectiveRate = new Prisma.Decimal(previous.earned).div(previous.netUnits);
  return effectiveRate.times(units);
}

/** The last SEALED statement for a contract — source of the reserve to release. */
async function previousStatement(contractId: string, window: PeriodWindow) {
  return prisma.royaltyStatement.findFirst({
    where: {
      contractId,
      run: { status: { in: ["APPROVED", "SENT"] }, periodEnd: { lt: window.start } },
    },
    orderBy: { run: { periodEnd: "desc" } },
  });
}

export type RunResult = {
  runId: string;
  period: string;
  contracts: number;
  statements: number;
  totalEarned: Prisma.Decimal;
  totalPayable: Prisma.Decimal;
  skipped: { contractId: string; reason: string }[];
};

/**
 * Build (or rebuild) the DRAFT run for a period. A DRAFT may be recomputed as
 * often as you like; an APPROVED/SENT period is sealed and refuses to move.
 */
export async function runRoyalty(period: string, userId: string, now: Date = new Date()): Promise<RunResult> {
  const window = parsePeriod(period);
  assertPeriodClosed(window, now);

  const existing = await prisma.royaltyRun.findUnique({ where: { period } });
  if (existing && existing.status !== "DRAFT") {
    throw new RoyaltyRunError(
      `${period} davri muhrlangan (${existing.status}) — qayta hisoblash taqiqlangan`,
    );
  }

  // A sealed period owns its window. Without this, "2026-H1" and "2026-M03"
  // would each happily issue a statement for the same March sales — the author
  // gets paid twice and the tier ladder advances twice.
  const overlapping = await prisma.royaltyRun.findFirst({
    where: {
      period: { not: period },
      sealedAt: { not: null },
      periodStart: { lte: window.end },
      periodEnd: { gte: window.start },
    },
    select: { period: true },
  });
  if (overlapping) {
    throw new RoyaltyRunError(
      `${period} davri muhrlangan ${overlapping.period} davri bilan kesishadi — bir sotuv ikki marta hisoblanmaydi`,
    );
  }

  const contracts = await prisma.contract.findMany({
    where: { status: "ACTIVE", archivedAt: null },
    include: { tiers: { orderBy: { fromUnits: "asc" } }, contributor: { select: { fullName: true } } },
  });

  const result: RunResult = {
    runId: "",
    period,
    contracts: contracts.length,
    statements: 0,
    totalEarned: new Prisma.Decimal(0),
    totalPayable: new Prisma.Decimal(0),
    skipped: [],
  };

  return runWithAudit({ userId }, async () => {
    const run = existing
      ? await prisma.royaltyRun.update({
          where: { id: existing.id },
          data: { periodStart: window.start, periodEnd: window.end, createdById: userId },
        })
      : await prisma.royaltyRun.create({
          data: {
            period,
            periodStart: window.start,
            periodEnd: window.end,
            status: "DRAFT",
            createdById: userId,
          },
        });
    result.runId = run.id;
    // A rebuild starts from a clean slate — no half-updated statements.
    await prisma.royaltyStatement.deleteMany({ where: { runId: run.id } });

    for (const c of contracts) {
      // BUYOUT has no engine — the fee is already a title cost (M3/M7).
      if (c.type === "BUYOUT") {
        result.skipped.push({ contractId: c.id, reason: "BUYOUT — dvigatel ishlamaydi" });
        continue;
      }
      if (!c.titleId) {
        result.skipped.push({ contractId: c.id, reason: "Asar bogʻlanmagan" });
        continue;
      }

      const groups = await soldByFormat(c.titleId, window);
      const prev = await previousStatement(c.id, window);
      const outstanding = await advanceOutstanding(c.id);
      const returnImpact = await actualReturnImpact(c.id, c.titleId, window);

      const tiers: TierInput[] = c.tiers.map((t) => ({
        id: t.id,
        format: t.format,
        fromUnits: t.fromUnits,
        toUnits: t.toUnits,
        rate: new Prisma.Decimal(t.rate),
        basis: t.basis,
      }));

      // Each format walks its own cumulative axis (spec: "for (title, format)").
      let earned = new Prisma.Decimal(0);
      let unitsSold = 0;
      let returnedUnits = 0;
      let netUnits = 0;
      let cumBeforeTotal = 0;
      const detail: unknown[] = [];

      for (const g of groups) {
        const cumBefore = await cumulativeBefore(c.titleId, g.format, window);
        const sub = buildStatement({
          cumulativeBefore: cumBefore,
          unitsSold: g.unitsSold,
          returnedUnits: g.returnedUnits,
          tiers,
          format: g.format,
          listUnit: g.listUnit,
          netUnit: g.netUnit,
          reserveRate: 0, // reserve/recoup are applied once, at contract level
        });

        earned = earned.plus(sub.earned);
        unitsSold += g.unitsSold;
        returnedUnits += g.returnedUnits;
        netUnits += sub.netUnits;
        cumBeforeTotal += cumBefore;

        detail.push({
          format: g.format,
          cumulativeBefore: cumBefore,
          unitsSold: g.unitsSold,
          returnedUnits: g.returnedUnits,
          netUnits: sub.netUnits,
          listUnit: g.listUnit.toFixed(2),
          netUnit: g.netUnit.toFixed(2),
          uncoveredUnits: sub.uncoveredUnits,
          tiers: sub.lines.map((l) => ({
            tierId: l.tierId,
            range: l.toUnits == null ? `${l.fromUnits + 1}+` : `${l.fromUnits + 1}–${l.toUnits + 1}`,
            units: l.units,
            basis: l.basis,
            baseUnit: l.baseUnit.toFixed(2),
            rate: l.rate.toFixed(4),
            amount: l.amount.toFixed(2),
            explain: explainTierLine(l),
          })),
        });
      }

      // Nothing sold and nothing to release — no statement worth issuing.
      const hasPrevReserve = prev && new Prisma.Decimal(prev.reserveHeld).gt(0);
      if (netUnits === 0 && !hasPrevReserve) {
        result.skipped.push({ contractId: c.id, reason: "Davrda sotuv yoʻq" });
        continue;
      }

      const reserveRate = new Prisma.Decimal(c.reserveRate);
      const reserveHeld = earned.times(reserveRate);
      const reserveReleased = Prisma.Decimal.max(
        new Prisma.Decimal(prev?.reserveHeld ?? 0).minus(returnImpact),
        0,
      );
      const payableBefore = earned.minus(reserveHeld).plus(reserveReleased);
      const advanceRecouped = Prisma.Decimal.min(
        Prisma.Decimal.max(payableBefore, 0),
        outstanding,
      );
      const payable = Prisma.Decimal.max(payableBefore.minus(advanceRecouped), 0);

      await prisma.royaltyStatement.create({
        data: {
          runId: run.id,
          contractId: c.id,
          earned: new Prisma.Decimal(earned.toFixed(2)),
          reserveHeld: new Prisma.Decimal(reserveHeld.toFixed(2)),
          reserveReleased: new Prisma.Decimal(reserveReleased.toFixed(2)),
          advanceRecouped: new Prisma.Decimal(advanceRecouped.toFixed(2)),
          payable: new Prisma.Decimal(payable.toFixed(2)),
          unitsSold,
          returnedUnits,
          netUnits,
          cumulativeBefore: cumBeforeTotal,
          advanceOutstanding: new Prisma.Decimal(outstanding.minus(advanceRecouped).toFixed(2)),
          detail: {
            reserveRate: reserveRate.toFixed(4),
            returnImpact: returnImpact.toFixed(2),
            payableBefore: payableBefore.toFixed(2),
            previousStatementId: prev?.id ?? null,
            byFormat: detail,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      result.statements += 1;
      result.totalEarned = result.totalEarned.plus(earned);
      result.totalPayable = result.totalPayable.plus(payable);
    }

    return result;
  });
}

/**
 * Maker-checker approval. Approving SEALS the period: `sealedAt` is what
 * `runRoyalty` and the sales module check before touching that window again.
 */
export async function approveRoyaltyRun(runId: string, approverId: string) {
  const run = await prisma.royaltyRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.status !== "DRAFT") {
    throw new RoyaltyRunError(`Faqat QORALAMA run tasdiqlanadi (holat: ${run.status})`);
  }
  const count = await prisma.royaltyStatement.count({ where: { runId } });
  if (count === 0) throw new RoyaltyRunError("Bo'sh run tasdiqlanmaydi — hisobot satri yoʻq");
  assertDifferentApprover(run.createdById, approverId);

  return runWithAudit({ userId: approverId }, async () =>
    prisma.royaltyRun.update({
      where: { id: runId },
      data: {
        status: "APPROVED",
        approvedById: approverId,
        approvedAt: new Date(),
        sealedAt: new Date(),
      },
    }),
  );
}

/** Statements go out to authors; the M8 portal only ever shows SENT periods. */
export async function sendRoyaltyRun(runId: string, userId: string) {
  const run = await prisma.royaltyRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.status !== "APPROVED") {
    throw new RoyaltyRunError(`Faqat tasdiqlangan run yuboriladi (holat: ${run.status})`);
  }
  return runWithAudit({ userId }, async () => {
    const updated = await prisma.royaltyRun.update({
      where: { id: runId },
      data: { status: "SENT", sentAt: new Date() },
    });
    await prisma.notification.create({
      data: {
        type: "ROYALTY_APPROVAL",
        severity: "INFO",
        title: "Royalti hisobotlari yuborildi",
        body: `${run.period} davri hisobotlari mualliflarga yuborildi`,
        linkUrl: "/royalties/runs",
        refType: "RoyaltyRun",
        refId: runId,
        targetRole: "DIRECTOR",
      },
    });
    return updated;
  });
}

/**
 * Is a date inside a sealed royalty period? The sales module can call this before
 * allowing a late edit that would silently change an issued statement.
 */
export async function isDateSealed(date: Date): Promise<boolean> {
  const hit = await prisma.royaltyRun.findFirst({
    where: {
      sealedAt: { not: null },
      periodStart: { lte: date },
      periodEnd: { gte: date },
    },
    select: { id: true },
  });
  return hit !== null;
}

export async function assertDateNotSealed(date: Date): Promise<void> {
  if (await isDateSealed(date)) {
    throw new RoyaltyRunError(
      "Bu sana muhrlangan royalti davriga tegishli — oʻzgartirish mualliflarga berilgan hisobotni buzadi",
    );
  }
}

export async function listRoyaltyRuns() {
  return prisma.royaltyRun.findMany({
    include: {
      createdBy: { select: { fullName: true } },
      approvedBy: { select: { fullName: true } },
      statements: {
        include: {
          contract: {
            include: {
              contributor: { select: { fullName: true } },
              title: { select: { workTitle: true } },
            },
          },
        },
      },
    },
    orderBy: { periodStart: "desc" },
  });
}

export async function getRoyaltyRun(runId: string) {
  return prisma.royaltyRun.findUniqueOrThrow({
    where: { id: runId },
    include: {
      createdBy: { select: { id: true, fullName: true } },
      approvedBy: { select: { fullName: true } },
      statements: {
        include: {
          contract: {
            include: {
              contributor: { select: { fullName: true, role: true } },
              title: { select: { workTitle: true } },
            },
          },
        },
        orderBy: { payable: "desc" },
      },
    },
  });
}
