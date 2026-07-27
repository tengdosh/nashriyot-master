/**
 * Deterministic demo world (docs/demo-data.md). Idempotent: every row carries a
 * `demo-` id/marker and the whole demo namespace is wiped first, so re-running
 * yields the exact same world. Built ON TOP of the base seed (prisma/seed.ts) —
 * reuses its entities, warehouses, channels, agents, printers and the author
 * contributor. Run: `npm run seed:demo` (after `npm run db:seed`).
 *
 * Goal: every screen shows coherent, non-zero data — not a byte-perfect replica
 * of every §5 golden number, but a live, self-consistent slice of all modules.
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

// Deterministic PRNG (mulberry32) — same world every run.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260630);
const jitter = (base: number, spread = 0.25) => Math.max(1, Math.round(base * (1 - spread + rand() * spread * 2)));

const NOW = new Date("2026-06-30T00:00:00Z");
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

// Base-seed fixtures.
const WH = { tasnim: "wh-tasnim-main", tahlil: "wh-tahlil-main" } as const;
const CH = { retail: "chan-retail", dist: "chan-distributor", mp: "chan-marketplace" } as const;

// ── wipe the demo namespace (children first) ────────────────────────────────────
async function wipe() {
  const P = { startsWith: "demo-" };
  const PP = { startsWith: "demo-p" };
  await prisma.audioChapter.deleteMany({ where: { job: { id: P } } });
  await prisma.audioJob.deleteMany({ where: { id: P } });
  await prisma.geoAnnotation.deleteMany({ where: { titleId: { startsWith: "demo-t" } } });
  await prisma.payment.deleteMany({ where: { id: P } });
  await prisma.return.deleteMany({ where: { id: P } });
  await prisma.receivable.deleteMany({ where: { id: P } });
  await prisma.payable.deleteMany({ where: { id: P } });
  await prisma.salesOrderLine.deleteMany({ where: { orderId: P } });
  await prisma.salesOrder.deleteMany({ where: { id: P } });
  await prisma.deadStockFlag.deleteMany({ where: { productId: PP } });
  await prisma.stockMovement.deleteMany({ where: { productId: PP } });
  await prisma.inventoryItem.deleteMany({ where: { productId: PP } });
  await prisma.dailyUnitCost.deleteMany({ where: { productId: PP } });
  await prisma.royaltyStatement.deleteMany({ where: { id: P } });
  await prisma.royaltyRun.deleteMany({ where: { id: P } });
  await prisma.royaltyTier.deleteMany({ where: { id: P } });
  await prisma.contract.deleteMany({ where: { id: P } });
  await prisma.costEntry.deleteMany({ where: { id: P } });
  await prisma.lead.deleteMany({ where: { id: P } });
  await prisma.notification.deleteMany({ where: { refId: { startsWith: "demo-" } } });
  await prisma.product.deleteMany({ where: { id: PP } });
  await prisma.edition.deleteMany({ where: { id: { startsWith: "demo-e" } } });
  await prisma.titleContributor.deleteMany({ where: { titleId: { startsWith: "demo-t" } } });
  await prisma.title.deleteMany({ where: { id: { startsWith: "demo-t" } } });
}

// ── §2.1 fixed costs (18 months, Jul-2025+ rent +10%) ───────────────────────────
async function fixedCosts() {
  const monthly: Record<string, number> = { "ent-tasnim": 53_800_000, "ent-tahlil": 32_200_000, "ent-sotuv": 39_000_000 };
  const rentBump: Record<string, number> = { "ent-tasnim": 900_000, "ent-tahlil": 600_000, "ent-sotuv": 700_000 };
  const rows: Prisma.CostEntryCreateManyInput[] = [];
  for (let m = 0; m < 18; m++) {
    const dt = new Date(Date.UTC(2025, m, 1));
    const bumped = dt >= day("2025-07-01");
    for (const e of Object.keys(monthly)) {
      const amt = monthly[e] + (bumped ? rentBump[e] : 0);
      rows.push({
        id: `demo-ce-${e}-${m}`,
        scope: "FIXED",
        category: "OYLIK",
        entityId: e,
        amount: D(amt),
        rate: D(1),
        amountUZS: D(amt),
        date: dt,
        campaign: null,
      });
    }
  }
  await prisma.costEntry.createMany({ data: rows });
  return rows.length;
}

// ── book matrix ─────────────────────────────────────────────────────────────────
type Book = {
  key: string; // T1, H1, ...
  entity: "ent-tasnim" | "ent-tahlil";
  title: string;
  keywords: string[];
  listPrice: number;
  printUnit: number; // FIFO cost / dona
  status: "ACTIVE" | "REVIEW" | "OUT_OF_PRINT";
  format?: "PAPERBACK" | "HARDCOVER" | "AUDIO";
  monthlyQty: number; // baseline sales/month
  activeFrom: string; // yyyy-mm-01
  textbook?: boolean; // seasonal ×3.5 in September
  deadStock?: boolean;
  abc?: "A" | "C";
  audioRights?: boolean;
  noSales?: boolean;
  editions?: { no: number; run: number }[];
};

const BOOKS: Book[] = [
  { key: "T20", entity: "ent-tasnim", title: "Saodatli oila bayoni", keywords: ["saodatli"], listPrice: 44000, printUnit: 39600, status: "ACTIVE", monthlyQty: 1200, activeFrom: "2025-02-01", abc: "A" },
  { key: "T1", entity: "ent-tasnim", title: "Psixologik urush", keywords: ["psixologik"], listPrice: 56000, printUnit: 50400, status: "ACTIVE", monthlyQty: 350, activeFrom: "2025-02-01", editions: [{ no: 1, run: 5000 }, { no: 2, run: 7000 }] },
  { key: "T6", entity: "ent-tasnim", title: "Bolakay ko'rsichqon tulki va tulpor", keywords: ["bolakay"], listPrice: 66000, printUnit: 59400, status: "ACTIVE", monthlyQty: 260, activeFrom: "2025-02-01" },
  { key: "T7", entity: "ent-tasnim", title: "Namoz", keywords: ["namoz"], listPrice: 54000, printUnit: 48600, status: "ACTIVE", monthlyQty: 300, activeFrom: "2025-02-01" },
  { key: "T5", entity: "ent-tasnim", title: "Nil", keywords: ["nil"], listPrice: 46000, printUnit: 41400, status: "ACTIVE", monthlyQty: 330, activeFrom: "2025-02-01" },
  { key: "T12", entity: "ent-tasnim", title: "Sotilayotgan kasalliklar", keywords: ["sotilayotgan"], listPrice: 56000, printUnit: 50400, status: "ACTIVE", monthlyQty: 220, activeFrom: "2025-02-01", textbook: true },
  { key: "T11", entity: "ent-tasnim", title: "Xolid ibn Valid", keywords: ["xolid"], listPrice: 49000, printUnit: 44100, status: "ACTIVE", monthlyQty: 240, activeFrom: "2025-02-01" },
  { key: "T14", entity: "ent-tasnim", title: "Temir tovon", keywords: ["temir"], listPrice: 56000, printUnit: 50400, status: "ACTIVE", format: "AUDIO", monthlyQty: 160, activeFrom: "2025-02-01", audioRights: true },
  { key: "T15", entity: "ent-tasnim", title: "Gunohning rangi", keywords: ["gunohning"], listPrice: 33000, printUnit: 29700, status: "ACTIVE", monthlyQty: 200, activeFrom: "2025-02-01" },
  { key: "T9", entity: "ent-tasnim", title: "Payg'ambarlar qissasi lotin", keywords: ["payg'ambarlar"], listPrice: 36000, printUnit: 32400, status: "ACTIVE", monthlyQty: 180, activeFrom: "2025-02-01" },
  { key: "T13", entity: "ent-tasnim", title: "Gilos daraxti bilan oramizdagi masofa", keywords: ["gilos"], listPrice: 42000, printUnit: 37800, status: "ACTIVE", monthlyQty: 33, activeFrom: "2026-05-01" },
  { key: "T2", entity: "ent-tasnim", title: "Inshiroh", keywords: ["inshiroh"], listPrice: 30000, printUnit: 27000, status: "ACTIVE", monthlyQty: 1, activeFrom: "2025-01-01", deadStock: true },
  { key: "T21", entity: "ent-tasnim", title: "Nikoh", keywords: ["nikoh"], listPrice: 25000, printUnit: 22500, status: "ACTIVE", monthlyQty: 40, activeFrom: "2025-02-01", abc: "C" },
  { key: "T17", entity: "ent-tasnim", title: "Zamzamning onasi", keywords: ["zamzamning"], listPrice: 44000, printUnit: 39600, status: "REVIEW", monthlyQty: 0, activeFrom: "2025-02-01", noSales: true },
  { key: "T18", entity: "ent-tasnim", title: "Olcha daraxti bilan", keywords: ["olcha"], listPrice: 30000, printUnit: 27000, status: "OUT_OF_PRINT", monthlyQty: 0, activeFrom: "2025-02-01", noSales: true },
  { key: "H1", entity: "ent-tahlil", title: "O'limdan keyingi yangi", keywords: ["o'limdan"], listPrice: 47000, printUnit: 42300, status: "ACTIVE", monthlyQty: 420, activeFrom: "2025-02-01" },
  { key: "H2", entity: "ent-tahlil", title: "Yashamoq sokinlik istar", keywords: ["yashamoq"], listPrice: 30000, printUnit: 27000, status: "ACTIVE", monthlyQty: 250, activeFrom: "2025-02-01" },
  { key: "H5", entity: "ent-tahlil", title: "Farzand", keywords: ["farzand"], listPrice: 38000, printUnit: 34200, status: "ACTIVE", monthlyQty: 190, activeFrom: "2025-02-01" },
  { key: "H8", entity: "ent-tahlil", title: "Dengiz bo'risi", keywords: ["dengiz"], listPrice: 49000, printUnit: 44100, status: "ACTIVE", monthlyQty: 200, activeFrom: "2025-02-01" },
  { key: "H9", entity: "ent-tahlil", title: "Yassiyurt", keywords: ["yassiyurt"], listPrice: 36000, printUnit: 32400, status: "ACTIVE", monthlyQty: 310, activeFrom: "2025-02-01" },
  { key: "H13", entity: "ent-tahlil", title: "Keyingi 100 yil", keywords: ["keyingi"], listPrice: 40000, printUnit: 36000, status: "ACTIVE", monthlyQty: 0, activeFrom: "2025-02-01", noSales: true },
];

function seasonality(dt: Date, textbook: boolean): number {
  const m = dt.getUTCMonth(); // 0=Jan
  let s = 1;
  if (m >= 5 && m <= 7) s = 0.7; // summer
  if (m === 11) s = 1.6; // December
  if (textbook && m === 8) s = 3.5; // September textbook peak
  return s;
}

type ProductRow = { productId: string; book: Book; warehouseId: string };

async function titlesAndInventory(): Promise<ProductRow[]> {
  const products: ProductRow[] = [];
  const statusMap = { ACTIVE: "ACTIVE", REVIEW: "REVIEW", OUT_OF_PRINT: "OUT_OF_PRINT" } as const;

  for (const b of BOOKS) {
    const titleId = `demo-t-${b.key}`;
    await prisma.title.create({
      data: {
        id: titleId,
        workTitle: b.title,
        status: statusMap[b.status],
        ownerType: "OWN",
        entityId: b.entity,
        language: "uz",
        description: `${b.title} — namunaviy demo kitob.`,
        keywords: b.keywords,
        themaCodes: [],
        bisacCodes: [],
      },
    });

    // Editions
    const eds = b.editions ?? [{ no: 1, run: 4000 }];
    let firstEditionId: string | null = null;
    for (const e of eds) {
      const edId = `demo-e-${b.key}-${e.no}`;
      if (!firstEditionId) firstEditionId = edId;
      await prisma.edition.create({
        data: { id: edId, titleId, editionNo: e.no, plannedRun: e.run, status: b.status === "OUT_OF_PRINT" ? "OUT_OF_PRINT" : "ACTIVE" },
      });
    }

    // Product(s). T9 gets a second product (kirill) → one work, two SKU.
    const skus = b.key === "T9" ? [`${b.key}-LAT`, `${b.key}-CYR`] : [b.key];
    for (const sku of skus) {
      const productId = `demo-p-${sku}`;
      await prisma.product.create({
        data: {
          id: productId,
          titleId,
          editionId: firstEditionId,
          format: b.format ?? "PAPERBACK",
          sku: `DEMO-${sku}`,
          listPrice: D(b.listPrice),
          vatRate: D(0),
          abcClass: b.abc ?? null,
        },
      });
      const wh = b.entity === "ent-tasnim" ? WH.tasnim : WH.tahlil;
      products.push({ productId, book: b, warehouseId: wh });

      // Inventory FIFO layers. T11 gets two USD-costed layers (12600/13100).
      if (!b.noSales || b.deadStock) {
        const layers =
          b.key === "T11"
            ? [
                { qty: Math.round(eds[0].run * 0.5), cost: b.printUnit, date: day("2025-05-15") },
                { qty: Math.round(eds[0].run * 0.5), cost: Math.round(b.printUnit * 1.04), date: day("2026-01-20") },
              ]
            : [{ qty: eds[0].run, cost: b.printUnit, date: day(b.activeFrom) }];
        for (let i = 0; i < layers.length; i++) {
          const L = layers[i];
          // Dead-stock title keeps most of its layer unsold (old remaining).
          const remaining = b.deadStock ? Math.round(L.qty * 0.85) : Math.round(L.qty * (0.15 + rand() * 0.25));
          await prisma.stockMovement.create({
            data: { productId, warehouseId: wh, type: "IN", qty: L.qty, unitCost: D(L.cost), qtyRemaining: remaining, refType: "Demo", date: L.date },
          });
          await prisma.inventoryItem.upsert({
            where: { productId_warehouseId: { productId, warehouseId: wh } },
            update: { qtyOnHand: { increment: remaining } },
            create: { productId, warehouseId: wh, qtyOnHand: remaining, qtyReserved: 0 },
          });
        }
      }
    }
  }

  // H5: an old consignment layer in Sardor's agent warehouse (95 days → alert).
  const h5 = products.find((p) => p.book.key === "H5");
  if (h5) {
    await prisma.stockMovement.create({
      data: { productId: h5.productId, warehouseId: "wh-agent-sardor", type: "IN", qty: 250, unitCost: D(h5.book.printUnit), qtyRemaining: 250, refType: "Demo", date: daysAgo(95) },
    });
    await prisma.inventoryItem.create({ data: { productId: h5.productId, warehouseId: "wh-agent-sardor", qtyOnHand: 250, qtyReserved: 0 } });
  }
  return products;
}

// ── sales, receivables, payments ────────────────────────────────────────────────
let orderSeq = 0;
let arSeq = 0;
let paySeq = 0;

async function makeOrder(opts: {
  entityId: string; warehouseId: string; channelId: string; partnerId: string | null;
  productId: string; qty: number; unitPrice: number; discountRate: number; cogsUnit: number;
  date: Date; paidFraction: number; customerName?: string;
}) {
  const orderId = `demo-o-${orderSeq++}`;
  const net = opts.unitPrice * (1 - opts.discountRate);
  const cmUnit = net - opts.cogsUnit;
  const amountUZS = Math.round(net * opts.qty);
  const paidUZS = Math.round(amountUZS * opts.paidFraction);
  const status = opts.paidFraction >= 1 ? "PAID" : opts.paidFraction > 0 ? "PARTIAL" : "INVOICED";

  await prisma.salesOrder.create({
    data: {
      id: orderId,
      channelId: opts.channelId,
      entityId: opts.entityId,
      warehouseId: opts.warehouseId,
      partnerId: opts.partnerId,
      customerName: opts.customerName ?? null,
      status: "SHIPPED",
      orderDate: opts.date,
      shippedDate: opts.date,
      lines: { create: [{ productId: opts.productId, qty: opts.qty, unitPrice: D(opts.unitPrice), discountRate: D(opts.discountRate), cogsUnit: D(opts.cogsUnit), cmUnit: D(cmUnit) }] },
    },
  });
  await prisma.receivable.create({
    data: {
      id: `demo-ar-${arSeq++}`,
      orderId,
      partnerId: opts.partnerId,
      entityId: opts.entityId,
      amountUZS: D(amountUZS),
      paidUZS: D(paidUZS),
      dueDate: new Date(opts.date.getTime() + 30 * 86_400_000),
      status: status === "PAID" ? "PAID" : status === "PARTIAL" ? "PARTIAL" : "OPEN",
    },
  });
  if (paidUZS > 0) {
    await prisma.payment.create({
      data: { id: `demo-pay-${paySeq++}`, direction: "IN", method: "BANK", entityId: opts.entityId, partnerId: opts.partnerId, amount: D(paidUZS), currency: "UZS", reconStatus: "MATCHED", refType: "SalesOrder", refId: orderId, date: new Date(opts.date.getTime() + 10 * 86_400_000) },
    });
  }
  return { orderId, amountUZS, paidUZS };
}

async function sales(products: ProductRow[]) {
  // Agent collection profiles (affect DSO / over-limit / stock age assertions).
  const agentProfile: Record<string, number> = { "partner-akmal": 1, "partner-bahodir": 0.15, "partner-sardor": 0.6 };
  const agents = ["partner-akmal", "partner-bahodir", "partner-sardor"];

  for (const p of products) {
    const b = p.book;
    if (b.noSales) continue;
    const start = day(b.activeFrom);
    // iterate months from activeFrom to NOW
    for (let dt = new Date(start); dt <= NOW; dt = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1))) {
      const s = seasonality(dt, !!b.textbook);
      const monthQty = Math.round(jitter(b.monthlyQty) * s);
      if (monthQty <= 0) continue;
      const mid = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), 15));

      // Channel mix: 55% agent, 20% distributor, 15% retail, 10% marketplace.
      const disc = { agent: 0.08, dist: 0.06, retail: 0.03, mp: 0.1 };
      const agent = agents[(orderSeq + b.key.length) % 3];
      const parts: { channelId: string; partnerId: string | null; qty: number; discount: number; paid: number; customer?: string }[] = [
        { channelId: CH.dist, partnerId: agent, qty: Math.round(monthQty * 0.55), discount: disc.agent, paid: agentProfile[agent] },
        { channelId: CH.dist, partnerId: null, qty: Math.round(monthQty * 0.2), discount: disc.dist, paid: 1, customer: "Distributor" },
        { channelId: CH.retail, partnerId: null, qty: Math.round(monthQty * 0.15), discount: disc.retail, paid: 1, customer: "Chakana" },
        { channelId: CH.mp, partnerId: null, qty: Math.round(monthQty * 0.1), discount: disc.mp, paid: 1, customer: "Marketpleys" },
      ];
      for (const part of parts) {
        if (part.qty <= 0) continue;
        await makeOrder({
          entityId: b.entity, warehouseId: p.warehouseId, channelId: part.channelId, partnerId: part.partnerId,
          productId: p.productId, qty: part.qty, unitPrice: b.listPrice, discountRate: part.discount, cogsUnit: b.printUnit,
          date: mid, paidFraction: part.paid, customerName: part.customer,
        });
      }
    }
  }
}

// ── contracts + royalty runs ────────────────────────────────────────────────────
async function contractsAndRoyalty() {
  // T5 BUYOUT (author fee → title-unique cost).
  await prisma.contract.create({
    data: { id: "demo-c-T5", contributorId: "contrib-author-demo", titleId: "demo-t-T5", type: "BUYOUT", buyoutAmount: D(7_000_000), audioRights: false, status: "ACTIVE" },
  });
  // T14 ROYALTY + AUDIO rights (audio pipeline demo).
  await prisma.contract.create({
    data: { id: "demo-c-T14", contributorId: "contrib-author-demo", titleId: "demo-t-T14", type: "ROYALTY", reserveRate: D(0.1), audioRights: true, status: "ACTIVE" },
  });
  // T6 ROYALTY with a tier crossing at 3000 units.
  const t6 = await prisma.contract.create({
    data: { id: "demo-c-T6", contributorId: "contrib-author-demo", titleId: "demo-t-T6", type: "ROYALTY", reserveRate: D(0.1), audioRights: false, status: "ACTIVE" },
  });
  await prisma.royaltyTier.createMany({
    data: [
      { id: "demo-tier-T6-1", contractId: t6.id, fromUnits: 0, toUnits: 3000, rate: D(0.1), basis: "LIST" },
      { id: "demo-tier-T6-2", contractId: t6.id, fromUnits: 3000, toUnits: null, rate: D(0.12), basis: "LIST" },
    ],
  });
  // T7 ROYALTY with a 12M advance ~64% recouped (author portal demo).
  const t7 = await prisma.contract.create({
    data: { id: "demo-c-T7", contributorId: "contrib-author-demo", titleId: "demo-t-T7", type: "ROYALTY", advanceAmount: D(12_000_000), reserveRate: D(0.1), audioRights: false, status: "ACTIVE" },
  });
  await prisma.royaltyTier.create({ data: { id: "demo-tier-T7-1", contractId: t7.id, fromUnits: 0, toUnits: null, rate: D(0.1), basis: "LIST" } });
  // H13 ROYALTY, zero sales → zero statement line.
  const h13 = await prisma.contract.create({
    data: { id: "demo-c-H13", contributorId: "contrib-author-demo", titleId: "demo-t-H13", type: "ROYALTY", reserveRate: D(0.1), audioRights: false, status: "ACTIVE" },
  });
  await prisma.royaltyTier.create({ data: { id: "demo-tier-H13-1", contractId: h13.id, fromUnits: 0, toUnits: null, rate: D(0.1), basis: "LIST" } });

  // Two SENT runs (2025-H1, 2025-H2) + one DRAFT (2026-H1, maker-checker pending).
  const runs = [
    { id: "demo-run-2025H1", period: "2025-H1", start: "2025-01-01", end: "2025-06-30", status: "SENT" as const },
    { id: "demo-run-2025H2", period: "2025-H2", start: "2025-07-01", end: "2025-12-31", status: "SENT" as const },
    { id: "demo-run-2026H1", period: "2026-H1", start: "2026-01-01", end: "2026-06-30", status: "DRAFT" as const },
  ];
  for (const r of runs) {
    const sent = r.status === "SENT";
    await prisma.royaltyRun.create({
      data: {
        id: r.id, period: r.period, periodStart: day(r.start), periodEnd: day(r.end), status: r.status,
        createdById: "user-editor", approvedById: sent ? "user-director" : null,
        approvedAt: sent ? day(r.end) : null, sealedAt: sent ? day(r.end) : null, sentAt: sent ? day(r.end) : null,
      },
    });
    // Statements: T6 (two-tier), T7 (advance recoup), H13 (zero) per run.
    const stmts: Prisma.RoyaltyStatementCreateManyInput[] = [];
    const mk = (cid: string, earned: number, recoup: number, units: number, outstanding: number) => ({
      id: `demo-st-${r.id}-${cid}`, runId: r.id, contractId: cid, earned: D(earned), reserveHeld: D(Math.round(earned * 0.1)),
      advanceRecouped: D(recoup), payable: D(Math.max(0, earned - Math.round(earned * 0.1) - recoup)),
      unitsSold: units, returnedUnits: 0, netUnits: units, cumulativeBefore: sent ? 0 : 3200, advanceOutstanding: D(outstanding),
    });
    stmts.push(mk("demo-c-T6", sent ? 9_000_000 : 4_000_000, 0, 2600, 0));
    stmts.push(mk("demo-c-T7", sent ? 5_000_000 : 3_000_000, sent ? 4_300_000 : 2_400_000, 1400, sent ? 7_700_000 : 4_300_000));
    stmts.push(mk("demo-c-H13", 0, 0, 0, 0));
    await prisma.royaltyStatement.createMany({ data: stmts });
  }
}

// ── payables (Istanbul USD print, Kamolot commission) + a PENDING recon payment ──
async function payables() {
  await prisma.payable.createMany({
    data: [
      { id: "demo-ap-istanbul-1", partnerId: "partner-istanbul", type: "PRINTING", amount: D(15_500), currency: "USD", rate: D(12_600), amountUZS: D(195_300_000), paidUZS: D(195_300_000), dueDate: day("2025-06-15"), status: "PAID", refType: "demo", refId: "demo-ap-istanbul-1" },
      { id: "demo-ap-istanbul-2", partnerId: "partner-istanbul", type: "PRINTING", amount: D(16_100), currency: "USD", rate: D(13_100), amountUZS: D(210_910_000), paidUZS: D(80_000_000), dueDate: day("2026-02-20"), status: "PARTIAL", refType: "demo", refId: "demo-ap-istanbul-2" },
      { id: "demo-ap-kamolot", partnerId: "partner-kamolot", type: "COMMISSION_BOOKS", amount: D(18_000_000), currency: "UZS", rate: D(1), amountUZS: D(18_000_000), paidUZS: D(0), dueDate: day("2026-05-30"), status: "OPEN", refType: "demo", refId: "demo-ap-kamolot" },
      { id: "demo-ap-qamar", partnerId: "partner-qamar", type: "PRINTING", amount: D(120_000_000), currency: "UZS", rate: D(1), amountUZS: D(120_000_000), paidUZS: D(120_000_000), dueDate: day("2025-09-20"), status: "PAID", refType: "demo", refId: "demo-ap-qamar" },
    ],
  });
  // OUT payments for the paid AP (cash out).
  await prisma.payment.createMany({
    data: [
      { id: "demo-pay-ap1", direction: "OUT", method: "BANK", entityId: "ent-tasnim", partnerId: "partner-istanbul", amount: D(195_300_000), currency: "UZS", reconStatus: "MATCHED", refType: "Payable", refId: "demo-ap-istanbul-1", date: day("2025-06-20") },
      { id: "demo-pay-ap2", direction: "OUT", method: "BANK", entityId: "ent-tasnim", partnerId: "partner-istanbul", amount: D(80_000_000), currency: "UZS", reconStatus: "MATCHED", refType: "Payable", refId: "demo-ap-istanbul-2", date: day("2026-02-25") },
      { id: "demo-pay-ap-qamar", direction: "OUT", method: "BANK", entityId: "ent-tasnim", partnerId: "partner-qamar", amount: D(120_000_000), currency: "UZS", reconStatus: "MATCHED", refType: "Payable", refId: "demo-ap-qamar", date: day("2025-09-25") },
      // H14: a PENDING payment on 15-Jun 2026 — the reconciliation mismatch.
      { id: "demo-pay-recon", direction: "IN", method: "BANK", entityId: "ent-tahlil", partnerId: "partner-akmal", amount: D(4_250_000), currency: "UZS", reconStatus: "PENDING", refType: "SalesOrder", refId: "demo-recon", date: day("2026-06-15") },
    ],
  });
}

// ── leads campaigns (H1 4.2x ROI, H2 0.6x ROI) ───────────────────────────────────
async function leads() {
  const rows: Prisma.LeadCreateManyInput[] = [];
  let n = 0;
  const mk = (campaign: string, titleId: string, converted: boolean, i: number, source: "INSTAGRAM" | "TELEGRAM") => ({
    id: `demo-lead-${n++}`, campaign, source, contact: `${campaign}-${i}`, interestTitleId: titleId,
    status: (converted ? "ORDERED" : (["NEW", "CONTACTED", "LOST"] as const)[i % 3]) as "ORDERED" | "NEW" | "CONTACTED" | "LOST",
    assigneeId: "user-sales", lastContactAt: daysAgo(10 + (i % 30)),
  });
  for (let i = 0; i < 60; i++) rows.push(mk("Mart-2026", "demo-t-H1", i < 26, i, "INSTAGRAM")); // high conversion
  for (let i = 0; i < 40; i++) rows.push(mk("May-2026", "demo-t-H2", i < 5, i, "TELEGRAM")); // low conversion
  await prisma.lead.createMany({ data: rows });
  // Campaign marketing cost (cost_entries with campaign tag) → ROI.
  await prisma.costEntry.createMany({
    data: [
      { id: "demo-ce-camp-mart", scope: "FIXED", category: "MARKETING_BRAND", entityId: "ent-tahlil", amount: D(468_000), rate: D(1), amountUZS: D(468_000), date: day("2026-03-01"), campaign: "Mart-2026" },
      { id: "demo-ce-camp-may", scope: "FIXED", category: "MARKETING_BRAND", entityId: "ent-tahlil", amount: D(475_000), rate: D(1), amountUZS: D(475_000), date: day("2026-05-01"), campaign: "May-2026" },
    ],
  });
}

// ── dead-stock flag (T2) + dashboard notifications ───────────────────────────────
async function alerts(products: ProductRow[]) {
  const t2 = products.find((p) => p.book.key === "T2");
  if (t2) {
    const qty = 2200;
    const unitCost = t2.book.printUnit;
    const deadCost = qty * unitCost;
    await prisma.deadStockFlag.create({
      data: {
        productId: t2.productId, ageDays: 210, qtyOnHand: qty, unitCost: D(unitCost), deadCost: D(deadCost),
        carryingCost: D(Math.round(deadCost * 0.18)), opportunityCost: D(Math.round(deadCost * 0.15)),
        totalLoss: D(deadCost + Math.round(deadCost * 0.33)), carryingRate: D(0.18), expectedROI: D(0.15),
        thresholdDays: 180, status: "OPEN", suggestedDiscount: D(0.3),
      },
    });
  }
  const notifs: Prisma.NotificationCreateManyInput[] = [
    { type: "ROP", severity: "WARNING", title: "Qayta buyurtma nuqtasi", body: "Aqida darsligi (T12): zaxira ROP dan past", linkUrl: "/inventory", entityId: "ent-tasnim", targetRole: "WAREHOUSE_MANAGER", refType: "demo", refId: "demo-n-rop" },
    { type: "BREAK_EVEN", severity: "CRITICAL", title: "Qaytmas nuqta xavfi", body: "Tafakkur bog'i (T2): 30 kundan kam", linkUrl: "/costing", entityId: "ent-tasnim", targetRole: "DIRECTOR", refType: "demo", refId: "demo-n-be" },
    { type: "DEAD_STOCK", severity: "WARNING", title: "O'lik zaxira", body: "Tafakkur bog'i (T2): 210 kun harakatsiz", linkUrl: "/inventory/dead-stock", entityId: "ent-tasnim", targetRole: "DIRECTOR", refType: "demo", refId: "demo-n-dead" },
    { type: "CREDIT_LIMIT", severity: "CRITICAL", title: "Kredit limiti oshdi", body: "Bahodir (agent): limit 25 mln oshdi", linkUrl: "/finance/receivables", entityId: "ent-sotuv", targetRole: "ACCOUNTANT", refType: "demo", refId: "demo-n-limit" },
    { type: "GENERAL", severity: "WARNING", title: "Konsignatsiya eskirdi", body: "Sardor: 250 dona 95 kun turibdi", linkUrl: "/finance/agents", entityId: "ent-sotuv", targetRole: "SALES_MANAGER", refType: "demo", refId: "demo-n-consign" },
    { type: "VARIANCE", severity: "INFO", title: "Bosma reja-fakt farqi", body: "Safar esdaliklari (T19): +15%", linkUrl: "/production/print-orders", entityId: "ent-tasnim", targetRole: "PRODUCTION_MANAGER", refType: "demo", refId: "demo-n-var" },
    { type: "ROYALTY_APPROVAL", severity: "INFO", title: "Royalti tasdiq kutmoqda", body: "2026-H1 run — maker-checker", linkUrl: "/royalties/runs", targetRole: "DIRECTOR", refType: "demo", refId: "demo-n-roy" },
    { type: "AR_OVERDUE", severity: "CRITICAL", title: "Muddati o'tgan qarz", body: "Sardor: 90+ kun kechikdi", linkUrl: "/finance/receivables", entityId: "ent-sotuv", targetRole: "ACCOUNTANT", refType: "demo", refId: "demo-n-ar" },
  ];
  await prisma.notification.createMany({ data: notifs });
  return notifs.length;
}

async function refreshViews() {
  for (const v of ["mv_monthly_sales", "mv_title_kpi", "mv_ar_aging"]) {
    try {
      await prisma.$executeRawUnsafe(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${v}`);
    } catch {
      try { await prisma.$executeRawUnsafe(`REFRESH MATERIALIZED VIEW ${v}`); } catch { /* view may not exist */ }
    }
  }
}

async function main() {
  console.log("Demo seed: wiping demo namespace…");
  await wipe();
  const ce = await fixedCosts();
  const products = await titlesAndInventory();
  await sales(products);
  await contractsAndRoyalty();
  await payables();
  await leads();
  const nAlerts = await alerts(products);
  await refreshViews();

  const [titles, prods, orders, ar, ap, pays, runs, leadCount] = await Promise.all([
    prisma.title.count({ where: { id: { startsWith: "demo-t" } } }),
    prisma.product.count({ where: { id: { startsWith: "demo-p" } } }),
    prisma.salesOrder.count({ where: { id: { startsWith: "demo-o" } } }),
    prisma.receivable.count({ where: { id: { startsWith: "demo-ar" } } }),
    prisma.payable.count({ where: { id: { startsWith: "demo-ap" } } }),
    prisma.payment.count({ where: { id: { startsWith: "demo-pay" } } }),
    prisma.royaltyRun.count({ where: { id: { startsWith: "demo-run" } } }),
    prisma.lead.count({ where: { id: { startsWith: "demo-lead" } } }),
  ]);
  console.log("Demo seed complete:");
  console.table({ fixedCostRows: ce, titles, products: prods, orders, receivables: ar, payables: ap, payments: pays, royaltyRuns: runs, leads: leadCount, notifications: nAlerts });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
