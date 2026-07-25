import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runWithAudit } from "@/lib/audit-context";
import { agingBucket, agingSummary, daysOverdue, type AgingBucket } from "@/lib/sales";
import type { PaymentRegisterInput } from "@/lib/validators/sales";

export class ReceivableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReceivableError";
  }
}

export type ReceivableRow = {
  id: string;
  orderId: string;
  partnerName: string | null;
  customerName: string | null;
  entityId: string;
  entityName: string;
  amountUZS: Prisma.Decimal;
  paidUZS: Prisma.Decimal;
  outstandingUZS: Prisma.Decimal;
  dueDate: Date | null;
  daysOverdue: number;
  bucket: AgingBucket;
  status: string;
};

/** AR aging report (spec v1 §5.5): 0–30 / 31–60 / 61–90 / 90+. */
export async function agingReport(now: Date = new Date()) {
  const rows = await prisma.receivable.findMany({
    where: { status: { in: ["OPEN", "PARTIAL"] } },
    include: {
      partner: { select: { name: true } },
      entity: { select: { name: true } },
      order: { select: { customerName: true } },
    },
    orderBy: { dueDate: "asc" },
  });

  const view: ReceivableRow[] = rows.map((r) => {
    const outstandingUZS = new Prisma.Decimal(r.amountUZS).minus(r.paidUZS);
    const od = daysOverdue(r.dueDate, now);
    return {
      id: r.id,
      orderId: r.orderId,
      partnerName: r.partner?.name ?? null,
      customerName: r.order.customerName,
      entityId: r.entityId,
      entityName: r.entity.name,
      amountUZS: new Prisma.Decimal(r.amountUZS),
      paidUZS: new Prisma.Decimal(r.paidUZS),
      outstandingUZS,
      dueDate: r.dueDate,
      daysOverdue: od,
      bucket: agingBucket(od),
      status: r.status,
    };
  });

  const summary = agingSummary(
    view.map((v) => ({ outstandingUZS: v.outstandingUZS, dueDate: v.dueDate })),
    now,
  );

  return { rows: view, summary };
}

/**
 * Register a payment against AR. Partial payments are normal — the row only
 * closes when the full sealed amount is covered, and an overpayment is refused
 * rather than silently absorbed.
 */
export async function registerPayment(input: PaymentRegisterInput, userId: string) {
  const r = await prisma.receivable.findUniqueOrThrow({
    where: { id: input.receivableId },
    include: { order: { select: { id: true, entityId: true, partnerId: true } } },
  });
  if (r.status === "PAID") throw new ReceivableError("Bu qarz allaqachon toʻlangan");

  const amount = new Prisma.Decimal(input.amountUZS);
  const outstanding = new Prisma.Decimal(r.amountUZS).minus(r.paidUZS);
  if (amount.gt(outstanding)) {
    throw new ReceivableError(
      `Toʻlov qoldiqdan oshib ketdi: qoldiq ${outstanding.toFixed(0)} soʻm, toʻlov ${amount.toFixed(0)} soʻm`,
    );
  }

  const paidUZS = new Prisma.Decimal(r.paidUZS).plus(amount);
  const fullyPaid = paidUZS.gte(r.amountUZS);

  return runWithAudit({ userId }, async () =>
    prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          direction: "IN",
          method: input.method,
          entityId: r.entityId,
          partnerId: r.partnerId,
          amount,
          currency: "UZS",
          refType: "SalesOrder",
          refId: r.orderId,
        },
      });
      const updated = await tx.receivable.update({
        where: { id: r.id },
        data: { paidUZS, status: fullyPaid ? "PAID" : "PARTIAL" },
      });
      // The order only reaches PAID when the debt is fully settled.
      if (fullyPaid) {
        await tx.salesOrder.update({
          where: { id: r.orderId },
          data: { status: "PAID", paidDate: new Date() },
        });
      }
      return updated;
    }),
  );
}

export type ArOverdueResult = { scanned: number; alerts: number; overdueTotal: Prisma.Decimal };

/**
 * Nightly AR job: one alert per overdue receivable, severity climbing with the
 * bucket. Every alert links to the screen that fixes it (spec §4.4).
 */
export async function runArOverdueScan(
  opts: { userId: string; now?: Date } = { userId: "system" },
): Promise<ArOverdueResult> {
  const now = opts.now ?? new Date();
  const { rows } = await agingReport(now);
  const out: ArOverdueResult = { scanned: rows.length, alerts: 0, overdueTotal: new Prisma.Decimal(0) };

  return runWithAudit({ userId: opts.userId }, async () => {
    for (const r of rows) {
      if (r.bucket === "CURRENT") continue;
      out.overdueTotal = out.overdueTotal.plus(r.outstandingUZS);

      // Don't re-alert the same debt every night — one open alert per receivable.
      const existing = await prisma.notification.findFirst({
        where: { type: "AR_OVERDUE", refType: "Receivable", refId: r.id, isRead: false },
      });
      if (existing) continue;

      const who = r.partnerName ?? r.customerName ?? "Mijoz";
      await prisma.notification.create({
        data: {
          type: "AR_OVERDUE",
          severity: r.bucket === "D90_PLUS" ? "CRITICAL" : r.bucket === "D61_90" ? "WARNING" : "INFO",
          title: "Muddati oʻtgan qarz",
          body: `${who}: ${r.outstandingUZS.toFixed(0)} soʻm, ${r.daysOverdue} kun kechikdi`,
          linkUrl: "/sales/receivables",
          refType: "Receivable",
          refId: r.id,
          entityId: r.entityId,
          targetRole: "ACCOUNTANT",
        },
      });
      out.alerts += 1;
    }
    return out;
  });
}
