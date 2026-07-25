import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { stockInTx } from "@/lib/services/inventory-service";
import {
  createSalesOrder,
  confirmSalesOrder,
  shipSalesOrder,
} from "@/lib/services/sales-service";
import { createReturn } from "@/lib/services/returns-service";
import {
  createContract,
  activateContract,
  updateContract,
  closeContract,
  advanceOutstanding,
  checkTiers,
  ContractError,
} from "@/lib/services/contract-service";
import {
  runRoyalty,
  approveRoyaltyRun,
  sendRoyaltyRun,
  isDateSealed,
  assertDateNotSealed,
  getRoyaltyRun,
  RoyaltyRunError,
} from "@/lib/services/royalty-service";
import { RoyaltyError } from "@/lib/royalty";
import { AuthzError } from "@/lib/rbac";

const MAKER = "user-sales";
const CHECKER = "user-director";
const MAIN = "wh-tasnim-main";
const OWN_STORE = "chan-ownstore"; // 0% default discount, 0 fee → net == list
const ENTITY = "ent-tasnim";

/** "Now" for the engine: well after 2026-H2 so both halves are closed. */
const NOW = new Date("2027-02-01T00:00:00Z");
const H1 = "2026-H1";
const H2 = "2026-H2";

let contributorId = "";
let titleId = "";
let productId = "";
const createdTitles: string[] = [];
const createdProducts: string[] = [];
const createdOrders: string[] = [];
const createdContracts: string[] = [];

async function newTitle(name: string) {
  const t = await prisma.title.create({
    data: {
      workTitle: name,
      ownerType: "OWN",
      entityId: ENTITY,
      language: "uz",
      keywords: [],
      themaCodes: [],
      bisacCodes: [],
    },
  });
  createdTitles.push(t.id);
  return t.id;
}

async function newProduct(tid: string, listPrice: number, format: "PAPERBACK" | "HARDCOVER" = "PAPERBACK") {
  const e = await prisma.edition.create({
    data: { titleId: tid, editionNo: 1, plannedRun: 20_000, status: "ACTIVE" },
  });
  const p = await prisma.product.create({
    data: {
      titleId: tid,
      editionId: e.id,
      format,
      listPrice: new Prisma.Decimal(listPrice),
      vatRate: new Prisma.Decimal(0),
    },
  });
  createdProducts.push(p.id);
  return { productId: p.id, editionId: e.id };
}

/**
 * Ship `qty` copies and force the order's shippedDate into the given period, so
 * the engine sees them as closed-period sales.
 */
async function shipInto(pid: string, qty: number, when: Date, listPrice: number) {
  await stockInTx({ productId: pid, warehouseId: MAIN, qty, unitCostUZS: 30_000 }, MAKER);
  const { order } = await createSalesOrder(
    {
      channelId: OWN_STORE,
      entityId: ENTITY,
      warehouseId: MAIN,
      customerName: "Royalti testi",
      lines: [{ productId: pid, qty, unitPrice: listPrice, discountRate: 0 }],
    },
    MAKER,
  );
  createdOrders.push(order.id);
  await confirmSalesOrder(order.id, MAKER);
  await shipSalesOrder(order.id, MAKER);
  await prisma.salesOrder.update({ where: { id: order.id }, data: { shippedDate: when } });
  const line = await prisma.salesOrderLine.findFirstOrThrow({ where: { orderId: order.id } });
  return { orderId: order.id, lineId: line.id };
}

/** Book a return and date it into a specific period. */
async function returnInto(lineId: string, qty: number, when: Date) {
  const r = await createReturn({ orderLineId: lineId, qty, condition: "SELLABLE" }, MAKER);
  await prisma.return.update({ where: { id: r.id }, data: { date: when } });
  return r.id;
}

/** The reference ladder from the unit tests: 8% → 10% → 12% on LIST. */
const LADDER = [
  { fromUnits: 0, toUnits: 2999, rate: 0.08, basis: "LIST" as const },
  { fromUnits: 3000, toUnits: 7999, rate: 0.1, basis: "LIST" as const },
  { fromUnits: 8000, toUnits: null, rate: 0.12, basis: "LIST" as const },
];

async function newRoyaltyContract(tid: string, opts: { advance?: number; reserveRate?: number } = {}) {
  const c = await createContract(
    {
      contributorId,
      titleId: tid,
      type: "ROYALTY",
      advanceAmount: opts.advance ?? 0,
      reserveRate: opts.reserveRate ?? 0,
      audioRights: false,
      tiers: LADDER,
    },
    MAKER,
  );
  createdContracts.push(c.id);
  await activateContract(c.id, MAKER);
  return c.id;
}

describe("M7 — huquqlar va royalti", () => {
  beforeAll(async () => {
    const c = await prisma.contributor.create({
      data: { fullName: "M7 test muallif", role: "AUTHOR" },
    });
    contributorId = c.id;
    titleId = await newTitle("M7 asosiy kitob");
    productId = (await newProduct(titleId, 100_000)).productId;
  });

  afterAll(async () => {
    const productId = { in: createdProducts };
    await prisma.royaltyStatement.deleteMany({ where: { contractId: { in: createdContracts } } });
    await prisma.royaltyRun.deleteMany({
      where: { period: { in: [H1, H2, "2025-Q1", "2024-H1", "2024-H2", "2023-M01", "2022-M05", "2021-M06"] } },
    });
    await prisma.royaltyTier.deleteMany({ where: { contractId: { in: createdContracts } } });
    await prisma.costEntry.deleteMany({ where: { contractId: { in: createdContracts } } });
    await prisma.costEntry.deleteMany({ where: { titleId: { in: createdTitles } } });
    await prisma.contract.deleteMany({ where: { id: { in: createdContracts } } });
    await prisma.return.deleteMany({ where: { orderLine: { productId } } });
    await prisma.receivable.deleteMany({ where: { orderId: { in: createdOrders } } });
    await prisma.salesOrderLine.deleteMany({ where: { orderId: { in: createdOrders } } });
    await prisma.salesOrder.deleteMany({ where: { id: { in: createdOrders } } });
    await prisma.notification.deleteMany({
      where: {
        OR: [
          { refType: "SalesOrder", refId: { in: createdOrders } },
          { refType: "Product", refId: { in: createdProducts } },
          { refType: "RoyaltyRun" },
        ],
      },
    });
    await prisma.stockMovement.deleteMany({ where: { productId } });
    await prisma.inventoryItem.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { id: { in: createdProducts } } });
    await prisma.edition.deleteMany({ where: { titleId: { in: createdTitles } } });
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: [...createdTitles, ...createdProducts, ...createdOrders, ...createdContracts] } },
    });
    await prisma.title.deleteMany({ where: { id: { in: createdTitles } } });
    await prisma.contributor.deleteMany({ where: { id: contributorId } });
    await prisma.$disconnect();
  });

  // ── Contracts ───────────────────────────────────────────────────────────────
  it("a ROYALTY contract needs a valid tier ladder; overlaps are rejected", async () => {
    await expect(
      createContract(
        {
          contributorId,
          titleId,
          type: "ROYALTY",
          advanceAmount: 0,
          reserveRate: 0,
          audioRights: false,
          tiers: [
            { fromUnits: 0, toUnits: 3000, rate: 0.08, basis: "LIST" },
            { fromUnits: 2500, toUnits: null, rate: 0.1, basis: "LIST" },
          ],
        },
        MAKER,
      ),
    ).rejects.toBeInstanceOf(RoyaltyError);

    expect(checkTiers(LADDER)).toEqual([]);
    expect(checkTiers([{ fromUnits: 0, toUnits: 100, rate: 0.1 }, { fromUnits: 500, toUnits: null, rate: 0.2 }])[0]).toContain(
      "uzilish",
    );
  });

  it("a BUYOUT contract writes ONE title cost entry and is idempotent", async () => {
    const tid = await newTitle("M7 buyout kitobi");
    const c = await createContract(
      {
        contributorId,
        titleId: tid,
        type: "BUYOUT",
        advanceAmount: 0,
        reserveRate: 0,
        buyoutAmount: 18_000_000,
        audioRights: false,
        tiers: [],
      },
      MAKER,
    );
    createdContracts.push(c.id);

    await activateContract(c.id, MAKER);
    let entries = await prisma.costEntry.findMany({ where: { contractId: c.id } });
    expect(entries).toHaveLength(1);
    expect(entries[0].scope).toBe("TITLE");
    expect(entries[0].category).toBe("MUALLIF_BUYOUT");
    expect(Number(entries[0].amountUZS)).toBe(18_000_000);
    expect(entries[0].titleId).toBe(tid);

    // Re-activating must not double the author cost.
    await expect(activateContract(c.id, MAKER)).rejects.toBeInstanceOf(ContractError); // already ACTIVE
    entries = await prisma.costEntry.findMany({ where: { contractId: c.id } });
    expect(entries).toHaveLength(1);
  });

  it("an ACTIVE contract's tier table is frozen", async () => {
    const tid = await newTitle("M7 muzlatilgan tier");
    const cid = await newRoyaltyContract(tid);
    await expect(
      updateContract({ id: cid, tiers: [{ fromUnits: 0, toUnits: null, rate: 0.5, basis: "LIST" }] }, MAKER),
    ).rejects.toBeInstanceOf(ContractError);
    // Non-tier fields are still editable.
    const updated = await updateContract({ id: cid, reserveRate: 0.2 }, MAKER);
    expect(Number(updated.reserveRate)).toBe(0.2);
    await closeContract(cid, MAKER);
  });

  // ── The engine ──────────────────────────────────────────────────────────────
  it("🏆 GOLDEN: kumulyativ tier ikki davr bo'ylab uzluksiz davom etadi", async () => {
    const cid = await newRoyaltyContract(titleId, { advance: 5_000_000, reserveRate: 0.15 });

    // H1: 4 000 shipped, 200 returned → 3 800 net.
    const h1 = await shipInto(productId, 4000, new Date("2026-03-15T00:00:00Z"), 100_000);
    await returnInto(h1.lineId, 200, new Date("2026-04-01T00:00:00Z"));

    const r1 = await runRoyalty(H1, MAKER, NOW);
    expect(r1.statements).toBe(1);

    const run1 = await getRoyaltyRun(r1.runId);
    const s1 = run1.statements.find((s) => s.contractId === cid)!;
    expect(s1.unitsSold).toBe(4000);
    expect(s1.returnedUnits).toBe(200);
    expect(s1.netUnits).toBe(3800);
    expect(s1.cumulativeBefore).toBe(0);
    // 3000 × 100 000 × 8% + 800 × 100 000 × 10% = 32 000 000
    expect(Number(s1.earned)).toBe(32_000_000);
    expect(Number(s1.reserveHeld)).toBe(4_800_000);
    expect(Number(s1.reserveReleased)).toBe(0);
    expect(Number(s1.advanceRecouped)).toBe(5_000_000);
    expect(Number(s1.advanceOutstanding)).toBe(0);
    expect(Number(s1.payable)).toBe(22_200_000);

    // The per-tier explanation is on the statement, not recomputed by the UI.
    const detail = s1.detail as { byFormat: { tiers: { range: string; units: number; explain: string }[] }[] };
    expect(detail.byFormat[0].tiers.map((t) => [t.range, t.units])).toEqual([
      ["1–3000", 3000],
      ["3001–8000", 800],
    ]);
    expect(detail.byFormat[0].tiers[0].explain).toContain("8.0%");

    // Seal H1 so H2 can release its reserve and see the recouped advance.
    await approveRoyaltyRun(r1.runId, CHECKER);

    // H2: 5 000 shipped, 500 returned in-period → 4 500 net, starting at 3 800.
    const h2 = await shipInto(productId, 5000, new Date("2026-09-10T00:00:00Z"), 100_000);
    await returnInto(h2.lineId, 500, new Date("2026-10-01T00:00:00Z"));

    const r2 = await runRoyalty(H2, MAKER, NOW);
    const run2 = await getRoyaltyRun(r2.runId);
    const s2 = run2.statements.find((s) => s.contractId === cid)!;

    expect(s2.cumulativeBefore).toBe(3800); // continues exactly where H1 stopped
    expect(s2.netUnits).toBe(4500);
    // 4 200 × 100 000 × 10% + 300 × 100 000 × 12% = 45 600 000
    expect(Number(s2.earned)).toBe(45_600_000);
    expect(Number(s2.reserveHeld)).toBe(6_840_000);
    expect(Number(s2.reserveReleased)).toBe(4_800_000); // H1's hold, no late returns
    expect(Number(s2.advanceRecouped)).toBe(0); // advance already recouped in H1
    expect(Number(s2.payable)).toBe(43_560_000); // 45.6 − 6.84 + 4.8

    const d2 = s2.detail as { byFormat: { tiers: { range: string; units: number }[] }[] };
    expect(d2.byFormat[0].tiers.map((t) => [t.range, t.units])).toEqual([
      ["3001–8000", 4200],
      ["8001+", 300],
    ]);

    await approveRoyaltyRun(r2.runId, CHECKER);
    await sendRoyaltyRun(r2.runId, MAKER);
  });

  it("determinizm: bir davrni ikki marta hisoblash aynan bir xil natija beradi", async () => {
    const tid = await newTitle("M7 determinizm");
    const { productId: pid } = await newProduct(tid, 50_000);
    const cid = await newRoyaltyContract(tid, { advance: 1_000_000, reserveRate: 0.1 });
    await shipInto(pid, 1200, new Date("2025-02-02T00:00:00Z"), 50_000);

    const a = await runRoyalty("2025-Q1", MAKER, NOW);
    const sa = (await getRoyaltyRun(a.runId)).statements.find((s) => s.contractId === cid)!;
    const b = await runRoyalty("2025-Q1", MAKER, NOW); // rebuild the same DRAFT
    const sb = (await getRoyaltyRun(b.runId)).statements.find((s) => s.contractId === cid)!;

    expect(a.runId).toBe(b.runId);
    expect(Number(sb.earned)).toBe(Number(sa.earned));
    expect(Number(sb.payable)).toBe(Number(sa.payable));
    expect(Number(sb.advanceRecouped)).toBe(Number(sa.advanceRecouped));
    expect(sb.netUnits).toBe(sa.netUnits);
    // 1200 × 50 000 × 8% = 4 800 000 ; reserve 10% ; advance 1 mln recouped
    expect(Number(sa.earned)).toBe(4_800_000);
    expect(Number(sa.payable)).toBe(3_320_000); // 4.8 − 0.48 − 1.0
    expect((await advanceOutstanding(cid)).toNumber()).toBe(1_000_000); // still DRAFT → not recouped yet
  });

  it("late returns eat into the released reserve instead of the new earnings", async () => {
    const tid = await newTitle("M7 kechikkan qaytish");
    const { productId: pid } = await newProduct(tid, 100_000);
    const cid = await newRoyaltyContract(tid, { reserveRate: 0.2 });

    // H1: 1 000 shipped, nothing returned → earned 8 000 000, reserve 1 600 000.
    const h1 = await shipInto(pid, 1000, new Date("2024-03-01T00:00:00Z"), 100_000);
    const r1 = await runRoyalty("2024-H1", MAKER, NOW);
    const s1 = (await getRoyaltyRun(r1.runId)).statements.find((s) => s.contractId === cid)!;
    expect(Number(s1.earned)).toBe(8_000_000);
    expect(Number(s1.reserveHeld)).toBe(1_600_000);
    expect(s1.netUnits).toBe(1000);
    await approveRoyaltyRun(r1.runId, CHECKER);

    // H2: 100 of H1's copies come back, and 500 new copies ship.
    await returnInto(h1.lineId, 100, new Date("2024-08-01T00:00:00Z"));
    await shipInto(pid, 500, new Date("2024-09-01T00:00:00Z"), 100_000);

    const r2 = await runRoyalty("2024-H2", MAKER, NOW);
    const s2 = (await getRoyaltyRun(r2.runId)).statements.find((s) => s.contractId === cid)!;

    // H1's effective rate = 8 000 000 / 1 000 = 8 000/copy → impact 800 000.
    const d2 = s2.detail as { returnImpact: string };
    expect(Number(d2.returnImpact)).toBe(800_000);
    // Released = 1 600 000 − 800 000 = 800 000. The late return did NOT reduce
    // H2's earnings — H2 earns on its own 500 copies only.
    expect(Number(s2.reserveReleased)).toBe(800_000);
    expect(s2.netUnits).toBe(500);
    expect(Number(s2.earned)).toBe(4_000_000); // 500 × 100 000 × 8% (still tier 1)
    expect(Number(s2.payable)).toBe(4_000_000); // 4.0 − 0.8 reserve + 0.8 released
  });

  it("BUYOUT shartnoma dvigatelda o'tkazib yuboriladi", async () => {
    const buyouts = await prisma.contract.findMany({
      where: { id: { in: createdContracts }, type: "BUYOUT", status: "ACTIVE" },
      select: { id: true },
    });
    expect(buyouts.length).toBeGreaterThanOrEqual(1);

    const r = await runRoyalty("2023-M01", MAKER, NOW);
    for (const b of buyouts) {
      expect(r.skipped.some((s) => s.contractId === b.id && s.reason.includes("BUYOUT"))).toBe(true);
      const stmt = await prisma.royaltyStatement.findFirst({ where: { runId: r.runId, contractId: b.id } });
      expect(stmt).toBeNull();
    }
  });

  it("NET basis sealed net narxni oladi, LIST asosiy narxni", async () => {
    const tid = await newTitle("M7 NET basis");
    const { productId: pid } = await newProduct(tid, 100_000);
    const c = await createContract(
      {
        contributorId,
        titleId: tid,
        type: "ROYALTY",
        advanceAmount: 0,
        reserveRate: 0,
        audioRights: true, // sub-rights flag
        tiers: [{ fromUnits: 0, toUnits: null, rate: 0.1, basis: "NET" }],
      },
      MAKER,
    );
    createdContracts.push(c.id);
    expect(c.audioRights).toBe(true);
    await activateContract(c.id, MAKER);

    // Ship at a 40% discount → sealed net unit is 60 000, not the 100 000 list.
    await stockInTx({ productId: pid, warehouseId: MAIN, qty: 100, unitCostUZS: 20_000 }, MAKER);
    const { order } = await createSalesOrder(
      {
        channelId: OWN_STORE,
        entityId: ENTITY,
        warehouseId: MAIN,
        customerName: "NET basis",
        lines: [{ productId: pid, qty: 100, unitPrice: 100_000, discountRate: 0.4 }],
      },
      MAKER,
    );
    createdOrders.push(order.id);
    await confirmSalesOrder(order.id, MAKER);
    await shipSalesOrder(order.id, MAKER);
    await prisma.salesOrder.update({
      where: { id: order.id },
      data: { shippedDate: new Date("2022-05-05T00:00:00Z") },
    });

    // Its own window — a sealed period owns its span, so tests never share one.
    const r = await runRoyalty("2022-M05", MAKER, NOW);
    const s = (await getRoyaltyRun(r.runId)).statements.find((x) => x.contractId === c.id)!;
    expect(Number(s.earned)).toBe(600_000); // 100 × 60 000 × 10%
    const d = s.detail as { byFormat: { netUnit: string; tiers: { basis: string }[] }[] };
    expect(Number(d.byFormat[0].netUnit)).toBe(60_000);
    expect(d.byFormat[0].tiers[0].basis).toBe("NET");

    await prisma.royaltyStatement.deleteMany({ where: { runId: r.runId } });
    await prisma.royaltyRun.delete({ where: { id: r.runId } });
  });

  // ── Determinism guards ──────────────────────────────────────────────────────
  it("an open period cannot be run at all", async () => {
    // "Now" inside 2026-H2 → H2 is not closed yet.
    await expect(runRoyalty(H2, MAKER, new Date("2026-09-01T00:00:00Z"))).rejects.toBeInstanceOf(
      RoyaltyError,
    );
    await expect(runRoyalty("nonsense", MAKER, NOW)).rejects.toBeInstanceOf(RoyaltyError);
  });

  it("an approved period is SEALED: no re-run, and its dates are protected", async () => {
    const approved = await prisma.royaltyRun.findFirstOrThrow({
      where: { period: H1, status: { in: ["APPROVED", "SENT"] } },
    });
    expect(approved.sealedAt).toBeTruthy();

    await expect(runRoyalty(H1, MAKER, NOW)).rejects.toBeInstanceOf(RoyaltyRunError);

    // A sealed period OWNS its window: a differently-labelled run covering the
    // same sales is refused, so a month inside a sealed half-year cannot pay the
    // author a second time.
    await expect(runRoyalty("2026-M03", MAKER, NOW)).rejects.toThrow(/kesishadi/);
    await expect(runRoyalty("2026-Q2", MAKER, NOW)).rejects.toThrow(/kesishadi/);
    // A window outside every sealed period is still allowed.
    const free = await runRoyalty("2027-M01", MAKER, NOW);
    expect(free.period).toBe("2027-M01");
    await prisma.royaltyStatement.deleteMany({ where: { runId: free.runId } });
    await prisma.royaltyRun.delete({ where: { id: free.runId } });

    // A date inside the sealed window is flagged; one outside is not.
    expect(await isDateSealed(new Date("2026-03-15T00:00:00Z"))).toBe(true);
    expect(await isDateSealed(new Date("2027-03-15T00:00:00Z"))).toBe(false);
    await expect(assertDateNotSealed(new Date("2026-03-15T00:00:00Z"))).rejects.toBeInstanceOf(
      RoyaltyRunError,
    );
    await expect(assertDateNotSealed(new Date("2027-03-15T00:00:00Z"))).resolves.toBeUndefined();
  });

  it("maker-checker: the user who built the run cannot approve it", async () => {
    const tid = await newTitle("M7 maker-checker");
    const { productId: pid } = await newProduct(tid, 100_000);
    await newRoyaltyContract(tid);
    await shipInto(pid, 100, new Date("2021-06-20T00:00:00Z"), 100_000);

    const r = await runRoyalty("2021-M06", MAKER, NOW);
    expect(r.statements).toBeGreaterThanOrEqual(1);
    await expect(approveRoyaltyRun(r.runId, MAKER)).rejects.toBeInstanceOf(AuthzError);

    const approved = await approveRoyaltyRun(r.runId, CHECKER);
    expect(approved.status).toBe("APPROVED");
    expect(approved.sealedAt).toBeTruthy();
    // Double approval and out-of-order send are both refused.
    await expect(approveRoyaltyRun(r.runId, CHECKER)).rejects.toBeInstanceOf(RoyaltyRunError);
    const sent = await sendRoyaltyRun(r.runId, MAKER);
    expect(sent.status).toBe("SENT");
    await expect(sendRoyaltyRun(r.runId, MAKER)).rejects.toBeInstanceOf(RoyaltyRunError);

    await prisma.notification.deleteMany({ where: { refType: "RoyaltyRun", refId: r.runId } });
    await prisma.royaltyStatement.deleteMany({ where: { runId: r.runId } });
    await prisma.royaltyRun.delete({ where: { id: r.runId } });
  });
});
