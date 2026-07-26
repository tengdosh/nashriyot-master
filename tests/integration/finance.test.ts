import { describe, it, expect, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  financeOverview,
  createPayable,
  payPayable,
  payablesReport,
  creditPanel,
  reconciliation,
  applyMatch,
  agentKpiReport,
  FinanceError,
} from "@/lib/services/finance-service";

const USER = "user-director";
const ENTITY = "ent-sotuv";
const PRINTER = "partner-qamar";
const AGENT = "partner-akmal";

const createdPayables: string[] = [];
const createdPayments: string[] = [];

afterAll(async () => {
  await prisma.payment.deleteMany({ where: { refType: "Payable", refId: { in: createdPayables } } });
  await prisma.payment.deleteMany({ where: { id: { in: createdPayments } } });
  await prisma.payable.deleteMany({ where: { id: { in: createdPayables } } });
});

async function mkPayable(amount: number, opts: Partial<Parameters<typeof createPayable>[0]> = {}) {
  const p = await createPayable(
    { partnerId: PRINTER, type: "PRINTING", amount, currency: "UZS", rate: 1, ...opts },
    USER,
  );
  createdPayables.push(p.id);
  return p;
}

describe("M15 — moliya markazi", () => {
  it("converts a foreign-currency payable to UZS at the given rate", async () => {
    const p = await mkPayable(1000, { currency: "USD", rate: 12500 });
    expect(new Prisma.Decimal(p.amountUZS).toString()).toBe("12500000");
  });

  it("pays a payable partially then fully, refusing an overpayment", async () => {
    const p = await mkPayable(1_000_000);

    const partial = await payPayable(
      { payableId: p.id, amountUZS: 400_000, entityId: ENTITY, method: "BANK" },
      USER,
    );
    expect(partial.status).toBe("PARTIAL");
    expect(new Prisma.Decimal(partial.paidUZS).toString()).toBe("400000");

    // overpaying the remaining 600k is refused
    await expect(
      payPayable({ payableId: p.id, amountUZS: 700_000, entityId: ENTITY, method: "BANK" }, USER),
    ).rejects.toThrow(FinanceError);

    const full = await payPayable(
      { payableId: p.id, amountUZS: 600_000, entityId: ENTITY, method: "BANK" },
      USER,
    );
    expect(full.status).toBe("PAID");

    // a paid payable can't be paid again
    await expect(
      payPayable({ payableId: p.id, amountUZS: 1, entityId: ENTITY, method: "BANK" }, USER),
    ).rejects.toThrow(FinanceError);

    // two OUT payments were booked against it
    const outs = await prisma.payment.findMany({ where: { refType: "Payable", refId: p.id } });
    expect(outs.length).toBe(2);
    expect(outs.every((o) => o.direction === "OUT")).toBe(true);
  });

  it("reflects a new payable in the AP total and aging report", async () => {
    const before = await financeOverview();
    const p = await mkPayable(2_000_000);
    const after = await financeOverview();
    expect(after.apTotal.minus(before.apTotal).toString()).toBe("2000000");

    const { rows } = await payablesReport();
    expect(rows.some((r) => r.id === p.id && r.outstandingUZS.toString() === "2000000")).toBe(true);
  });

  it("auto-matches a pending payment to a bank row, then confirms it", async () => {
    const p = await mkPayable(500_000);
    const paid = await payPayable(
      { payableId: p.id, amountUZS: 500_000, entityId: ENTITY, method: "BANK" },
      USER,
    );
    // find the OUT payment we just created
    const payment = await prisma.payment.findFirstOrThrow({
      where: { refType: "Payable", refId: p.id },
    });
    createdPayments.push(payment.id);
    expect(payment.reconStatus).toBe("PENDING");
    expect(paid.status).toBe("PAID");

    const bank = [
      {
        ref: "BANK-XYZ",
        partnerId: PRINTER,
        amount: new Prisma.Decimal(500_000),
        date: payment.date,
      },
    ];
    const report = await reconciliation(bank);
    expect(report.pending.some((r) => r.id === payment.id)).toBe(true);
    expect(report.matches).toContainEqual({ paymentId: payment.id, bankRef: "BANK-XYZ" });

    const matched = await applyMatch({ paymentId: payment.id, bankRef: "BANK-XYZ" }, USER);
    expect(matched.reconStatus).toBe("MATCHED");
    expect(matched.bankRef).toBe("BANK-XYZ");

    // a matched payment can't be matched again
    await expect(
      applyMatch({ paymentId: payment.id, bankRef: "BANK-XYZ" }, USER),
    ).rejects.toThrow(FinanceError);
  });

  it("reports credit usage for clients and agents", async () => {
    const panel = await creditPanel();
    const akmal = panel.find((r) => r.partnerId === AGENT);
    expect(akmal).toBeDefined();
    expect(akmal!.creditLimit!.toString()).toBe("40000000");
    // available = limit − outstanding
    if (akmal!.available != null) {
      expect(akmal!.available.toString()).toBe(
        akmal!.creditLimit!.minus(akmal!.outstanding).toString(),
      );
    }
  });

  it("produces agent KPI rows with the personal discount", async () => {
    const rows = await agentKpiReport();
    const akmal = rows.find((r) => r.partnerId === AGENT);
    expect(akmal).toBeDefined();
    expect(akmal!.discount.toString()).toBe("0.12");
    expect(akmal!.returnRatePct).toBeGreaterThanOrEqual(0);
    expect(akmal!.dso).toBeGreaterThanOrEqual(0);
    expect(akmal!.stockAgeDays).toBeGreaterThanOrEqual(0);
  });
});
