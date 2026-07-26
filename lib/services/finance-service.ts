import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runWithAudit } from "@/lib/audit-context";
import { agingBucket, agingSummary, daysOverdue, type AgingBucket } from "@/lib/sales";
import {
  cashByEntity,
  cashFlowByWeek,
  reconAutoMatch,
  type BankRow,
  type PendingPayment,
} from "@/lib/finance-center";
import { entityLedger } from "@/lib/services/transfer-service";
import type {
  PayableCreateInput,
  PayablePayInput,
  ReconMatchInput,
} from "@/lib/validators/finance";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

export class FinanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinanceError";
  }
}

// ── Overview (spec v2 §5.4: cash, AR/AP, internal ledger, weekly flow) ────────

export type FinanceOverview = {
  cashByEntity: { entityId: string; entityName: string; balance: Prisma.Decimal }[];
  cashTotal: Prisma.Decimal;
  arTotal: Prisma.Decimal;
  apTotal: Prisma.Decimal;
  ledgerTotal: Prisma.Decimal; // sum of net inter-entity balances owed
  weekly: { week: string; in: Prisma.Decimal; out: Prisma.Decimal; net: Prisma.Decimal }[];
};

export async function financeOverview(now: Date = new Date()): Promise<FinanceOverview> {
  const [payments, entities, receivables, payables, ledger] = await Promise.all([
    prisma.payment.findMany({
      select: { entityId: true, direction: true, amount: true, date: true },
      orderBy: { date: "asc" },
    }),
    prisma.entity.findMany({ where: { archivedAt: null }, select: { id: true, name: true } }),
    prisma.receivable.findMany({
      where: { status: { in: ["OPEN", "PARTIAL"] } },
      select: { amountUZS: true, paidUZS: true },
    }),
    prisma.payable.findMany({
      where: { status: { in: ["OPEN", "PARTIAL"] } },
      select: { amountUZS: true, paidUZS: true },
    }),
    entityLedger(),
  ]);

  const rows = payments.map((p) => ({
    entityId: p.entityId,
    direction: p.direction,
    amount: D(p.amount),
    date: p.date,
  }));

  const byEntity = cashByEntity(rows);
  const nameById = new Map(entities.map((e) => [e.id, e.name]));
  const cash = [...byEntity.entries()]
    .map(([entityId, balance]) => ({
      entityId,
      entityName: nameById.get(entityId) ?? entityId,
      balance: new Prisma.Decimal(balance.toString()),
    }))
    .sort((a, b) => a.entityName.localeCompare(b.entityName));

  const cashTotal = cash.reduce((a, c) => a.plus(c.balance), D(0));
  const arTotal = receivables.reduce((a, r) => a.plus(D(r.amountUZS).minus(r.paidUZS)), D(0));
  const apTotal = payables.reduce((a, p) => a.plus(D(p.amountUZS).minus(p.paidUZS)), D(0));
  const ledgerTotal = ledger.reduce((a, l) => a.plus(l.amount), D(0));

  // Only the trailing 12 ISO weeks are charted.
  const cutoff = new Date(now.getTime() - 84 * 86_400_000);
  const weekly = cashFlowByWeek(rows.filter((r) => r.date >= cutoff)).map((w) => ({
    week: w.week,
    in: new Prisma.Decimal(w.in.toString()),
    out: new Prisma.Decimal(w.out.toString()),
    net: new Prisma.Decimal(w.net.toString()),
  }));

  return { cashByEntity: cash, cashTotal, arTotal, apTotal, ledgerTotal, weekly };
}

// ── Payables (AP) ─────────────────────────────────────────────────────────────

export type PayableRow = {
  id: string;
  partnerName: string;
  type: string;
  amount: Prisma.Decimal;
  currency: string;
  rate: Prisma.Decimal;
  amountUZS: Prisma.Decimal;
  paidUZS: Prisma.Decimal;
  outstandingUZS: Prisma.Decimal;
  dueDate: Date | null;
  daysOverdue: number;
  bucket: AgingBucket;
  status: string;
};

export async function payablesReport(now: Date = new Date()) {
  const rows = await prisma.payable.findMany({
    where: { status: { in: ["OPEN", "PARTIAL"] } },
    include: { partner: { select: { name: true } } },
    orderBy: { dueDate: "asc" },
  });

  const view: PayableRow[] = rows.map((p) => {
    const outstandingUZS = D(p.amountUZS).minus(p.paidUZS);
    const od = daysOverdue(p.dueDate, now);
    return {
      id: p.id,
      partnerName: p.partner.name,
      type: p.type,
      amount: D(p.amount),
      currency: p.currency,
      rate: D(p.rate),
      amountUZS: D(p.amountUZS),
      paidUZS: D(p.paidUZS),
      outstandingUZS,
      dueDate: p.dueDate,
      daysOverdue: od,
      bucket: agingBucket(od),
      status: p.status,
    };
  });

  const summary = agingSummary(
    view.map((v) => ({ outstandingUZS: v.outstandingUZS, dueDate: v.dueDate })),
    now,
  );

  return { rows: view, summary };
}

export async function createPayable(input: PayableCreateInput, userId: string) {
  const amount = D(input.amount);
  const rate = D(input.rate);
  const amountUZS = input.currency === "UZS" ? amount : amount.times(rate);

  return runWithAudit({ userId }, async () =>
    prisma.payable.create({
      data: {
        partnerId: input.partnerId,
        type: input.type,
        amount,
        currency: input.currency,
        rate,
        amountUZS: amountUZS.toDecimalPlaces(2),
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        refType: input.note ? "manual" : null,
        refId: input.note ?? null,
      },
    }),
  );
}

/**
 * Pay a payable with an OUT payment. Partial payments are normal — the row only
 * closes at PAID when the full UZS amount is covered; an overpayment is refused.
 */
export async function payPayable(input: PayablePayInput, userId: string) {
  const p = await prisma.payable.findUniqueOrThrow({ where: { id: input.payableId } });
  if (p.status === "PAID") throw new FinanceError("Bu majburiyat allaqachon toʻlangan");

  const amount = D(input.amountUZS);
  const outstanding = D(p.amountUZS).minus(p.paidUZS);
  if (amount.gt(outstanding)) {
    throw new FinanceError(
      `Toʻlov qoldiqdan oshib ketdi: qoldiq ${outstanding.toFixed(0)} soʻm, toʻlov ${amount.toFixed(0)} soʻm`,
    );
  }

  const paidUZS = D(p.paidUZS).plus(amount);
  const fullyPaid = paidUZS.gte(p.amountUZS);

  return runWithAudit({ userId }, async () =>
    prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          direction: "OUT",
          method: input.method,
          entityId: input.entityId,
          partnerId: p.partnerId,
          amount,
          currency: "UZS",
          refType: "Payable",
          refId: p.id,
        },
      });
      return tx.payable.update({
        where: { id: p.id },
        data: { paidUZS, status: fullyPaid ? "PAID" : "PARTIAL" },
      });
    }),
  );
}

// ── Receivables + credit-limit panel ──────────────────────────────────────────

export type CreditRow = {
  partnerId: string;
  partnerName: string;
  creditLimit: Prisma.Decimal | null;
  outstanding: Prisma.Decimal;
  available: Prisma.Decimal | null; // null = no limit set
  isBlocked: boolean;
  overLimit: boolean;
};

/** Per-partner credit usage: current AR outstanding against the credit limit. */
export async function creditPanel(): Promise<CreditRow[]> {
  const [partners, receivables] = await Promise.all([
    prisma.partner.findMany({
      where: { archivedAt: null, roles: { hasSome: ["CLIENT", "AGENT"] } },
      select: { id: true, name: true, creditLimit: true, isBlocked: true },
      orderBy: { name: "asc" },
    }),
    prisma.receivable.groupBy({
      by: ["partnerId"],
      where: { status: { in: ["OPEN", "PARTIAL"] }, partnerId: { not: null } },
      _sum: { amountUZS: true, paidUZS: true },
    }),
  ]);

  const outByPartner = new Map<string, Prisma.Decimal>();
  for (const g of receivables) {
    if (!g.partnerId) continue;
    outByPartner.set(g.partnerId, D(g._sum.amountUZS ?? 0).minus(g._sum.paidUZS ?? 0));
  }

  return partners.map((p) => {
    const outstanding = outByPartner.get(p.id) ?? D(0);
    const creditLimit = p.creditLimit != null ? D(p.creditLimit) : null;
    const available = creditLimit != null ? creditLimit.minus(outstanding) : null;
    return {
      partnerId: p.id,
      partnerName: p.name,
      creditLimit,
      outstanding,
      available,
      isBlocked: p.isBlocked,
      overLimit: available != null && available.lt(0),
    };
  });
}

// ── Reconciliation (spec v2 §5.4: auto-match then manual) ─────────────────────

export type PendingPaymentRow = {
  id: string;
  direction: string;
  method: string;
  entityName: string;
  partnerId: string | null;
  partnerName: string | null;
  amount: Prisma.Decimal;
  date: Date;
};

export type ReconReport = {
  pending: PendingPaymentRow[];
  matches: { paymentId: string; bankRef: string }[];
  unmatchedPayments: string[];
  unmatchedBank: string[];
};

/**
 * List PENDING payments and, if bank rows are supplied, auto-match them by
 * partner + amount (tolerance) + date window. Whatever is left over is returned
 * for manual pairing.
 */
export async function reconciliation(
  bank: BankRow[] = [],
  opts: { days?: number; amountTol?: Prisma.Decimal.Value } = {},
): Promise<ReconReport> {
  const rows = await prisma.payment.findMany({
    where: { reconStatus: "PENDING" },
    include: {
      entity: { select: { name: true } },
      partner: { select: { name: true } },
    },
    orderBy: { date: "desc" },
  });

  const pending: PendingPaymentRow[] = rows.map((p) => ({
    id: p.id,
    direction: p.direction,
    method: p.method,
    entityName: p.entity.name,
    partnerId: p.partnerId,
    partnerName: p.partner?.name ?? null,
    amount: D(p.amount),
    date: p.date,
  }));

  const forMatch: PendingPayment[] = rows.map((p) => ({
    id: p.id,
    partnerId: p.partnerId,
    amount: D(p.amount),
    date: p.date,
  }));

  const { matches, unmatchedPayments, unmatchedBank } = reconAutoMatch(forMatch, bank, {
    days: opts.days,
    amountTol: opts.amountTol,
  });

  return { pending, matches, unmatchedPayments, unmatchedBank };
}

/** Confirm one pairing: the payment is stamped MATCHED with its bank reference. */
export async function applyMatch(input: ReconMatchInput, userId: string) {
  const p = await prisma.payment.findUniqueOrThrow({ where: { id: input.paymentId } });
  if (p.reconStatus === "MATCHED") throw new FinanceError("Bu toʻlov allaqachon solishtirilgan");

  return runWithAudit({ userId }, async () =>
    prisma.payment.update({
      where: { id: p.id },
      data: { reconStatus: "MATCHED", bankRef: input.bankRef },
    }),
  );
}

// ── Agent KPI (spec v2 §5.4: sales, collected, DSO, return %, stock age) ──────

export type AgentKpiRow = {
  partnerId: string;
  partnerName: string;
  discount: Prisma.Decimal; // personal discount, the agent's only lever
  salesNet: Prisma.Decimal; // sealed net of shipped orders
  collected: Prisma.Decimal; // IN payments received
  arOutstanding: Prisma.Decimal;
  dso: number; // days sales outstanding
  soldUnits: number;
  returnedUnits: number;
  returnRatePct: number;
  stockAgeDays: number; // weighted age of consignment stock
};

const SHIPPED_STATES = ["SHIPPED", "INVOICED", "PAID"] as const;

export async function agentKpiReport(
  now: Date = new Date(),
  periodDays = 90,
): Promise<AgentKpiRow[]> {
  const cutoff = new Date(now.getTime() - periodDays * 86_400_000);

  const agents = await prisma.partner.findMany({
    where: { archivedAt: null, roles: { has: "AGENT" } },
    select: {
      id: true,
      name: true,
      defaultDiscount: true,
      agentWarehouses: { select: { id: true } },
    },
    orderBy: { name: "asc" },
  });

  const out: AgentKpiRow[] = [];
  for (const a of agents) {
    const [orders, payAgg, receivables, layers] = await Promise.all([
      prisma.salesOrder.findMany({
        where: {
          partnerId: a.id,
          status: { in: [...SHIPPED_STATES] },
          shippedDate: { gte: cutoff },
        },
        select: {
          lines: {
            select: {
              qty: true,
              unitPrice: true,
              discountRate: true,
              returns: { select: { qty: true } },
            },
          },
        },
      }),
      prisma.payment.aggregate({
        where: { partnerId: a.id, direction: "IN", date: { gte: cutoff } },
        _sum: { amount: true },
      }),
      prisma.receivable.findMany({
        where: { partnerId: a.id, status: { in: ["OPEN", "PARTIAL"] } },
        select: { amountUZS: true, paidUZS: true },
      }),
      a.agentWarehouses.length
        ? prisma.stockMovement.findMany({
            where: {
              type: "IN",
              qtyRemaining: { gt: 0 },
              warehouseId: { in: a.agentWarehouses.map((w) => w.id) },
            },
            select: { qtyRemaining: true, date: true },
          })
        : Promise.resolve([]),
    ]);

    let salesNet = D(0);
    let soldUnits = 0;
    let returnedUnits = 0;
    for (const o of orders) {
      for (const l of o.lines) {
        const netUnit = D(l.unitPrice).times(D(1).minus(l.discountRate));
        const ret = l.returns.reduce((s, r) => s + r.qty, 0);
        soldUnits += l.qty;
        returnedUnits += ret;
        salesNet = salesNet.plus(netUnit.times(l.qty - ret));
      }
    }

    const collected = D(payAgg._sum.amount ?? 0);
    const arOutstanding = receivables.reduce((s, r) => s.plus(D(r.amountUZS).minus(r.paidUZS)), D(0));

    // DSO = AR ÷ (net sales ÷ period days). No sales ⇒ undefined ⇒ 0.
    const dso = salesNet.gt(0)
      ? Math.round(arOutstanding.div(salesNet.div(periodDays)).toNumber())
      : 0;

    const returnRatePct = soldUnits > 0 ? (returnedUnits / soldUnits) * 100 : 0;

    // Weighted average age (days) of remaining consignment layers.
    let ageWeighted = 0;
    let ageUnits = 0;
    for (const m of layers) {
      const rem = m.qtyRemaining ?? 0;
      ageUnits += rem;
      ageWeighted += rem * Math.floor((now.getTime() - m.date.getTime()) / 86_400_000);
    }
    const stockAgeDays = ageUnits > 0 ? Math.round(ageWeighted / ageUnits) : 0;

    out.push({
      partnerId: a.id,
      partnerName: a.name,
      discount: a.defaultDiscount != null ? D(a.defaultDiscount) : D(0),
      salesNet,
      collected,
      arOutstanding,
      dso,
      soldUnits,
      returnedUnits,
      returnRatePct,
      stockAgeDays,
    });
  }

  return out;
}
