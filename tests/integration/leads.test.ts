import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { stockInTx } from "@/lib/services/inventory-service";
import {
  createLead,
  moveLead,
  addNote,
  convertToOrder,
  campaignAnalytics,
  LeadError,
} from "@/lib/services/leads-service";

const USER = "user-sales";
const ENTITY = "ent-tasnim";
const RETAIL = "chan-retail"; // 35% default, fee 0
const MAIN = "wh-tasnim-main";
const CAMPAIGN = "LEADTEST-instagram";

let titleId = "";
let productId = "";
const created = { leads: [] as string[], orders: [] as string[], products: [] as string[], costs: [] as string[] };

describe("M14 — CRM lidlar", () => {
  beforeAll(async () => {
    const t = await prisma.title.create({
      data: { workTitle: "M14 test kitob", ownerType: "OWN", entityId: ENTITY, language: "uz", keywords: [], themaCodes: [], bisacCodes: [] },
    });
    titleId = t.id;
    const e = await prisma.edition.create({ data: { titleId, editionNo: 1, plannedRun: 3000, status: "ACTIVE" } });
    const p = await prisma.product.create({
      data: { titleId, editionId: e.id, format: "PAPERBACK", listPrice: new Prisma.Decimal(100_000), vatRate: new Prisma.Decimal(0) },
    });
    productId = p.id;
    created.products.push(p.id);
    await stockInTx({ productId, warehouseId: MAIN, qty: 200, unitCostUZS: 30_000 }, USER);
    // Marketing spend for the campaign.
    const c = await prisma.costEntry.create({
      data: { scope: "FIXED", category: "MARKETING_BRAND", entityId: ENTITY, campaign: CAMPAIGN, amount: new Prisma.Decimal(1_000_000), currency: "UZS", rate: new Prisma.Decimal(1), amountUZS: new Prisma.Decimal(1_000_000), date: new Date() },
    });
    created.costs.push(c.id);
  });

  afterAll(async () => {
    await prisma.lead.deleteMany({ where: { id: { in: created.leads } } });
    await prisma.salesOrderLine.deleteMany({ where: { orderId: { in: created.orders } } });
    await prisma.receivable.deleteMany({ where: { orderId: { in: created.orders } } });
    await prisma.salesOrder.deleteMany({ where: { id: { in: created.orders } } });
    await prisma.notification.deleteMany({ where: { refType: "SalesOrder", refId: { in: created.orders } } });
    await prisma.costEntry.deleteMany({ where: { id: { in: created.costs } } });
    await prisma.stockMovement.deleteMany({ where: { productId: { in: created.products } } });
    await prisma.inventoryItem.deleteMany({ where: { productId: { in: created.products } } });
    await prisma.product.deleteMany({ where: { id: { in: created.products } } });
    await prisma.edition.deleteMany({ where: { titleId } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: [titleId, ...created.products, ...created.orders, ...created.leads] } } });
    await prisma.title.deleteMany({ where: { id: titleId } });
    await prisma.$disconnect();
  });

  async function newLead(campaign = CAMPAIGN) {
    const l = await createLead({ source: "INSTAGRAM", campaign, contact: "Aziz +99890...", interestTitleId: titleId }, USER);
    created.leads.push(l.id);
    return l;
  }

  it("creates a NEW lead; a note advances it to CONTACTED and clears staleness", async () => {
    const l = await newLead();
    expect(l.status).toBe("NEW");
    const after = await addNote({ leadId: l.id, text: "Qoʻngʻiroq qilindi, qiziqmoqda" }, USER);
    expect(after.status).toBe("CONTACTED");
    expect(after.lastContactAt).toBeTruthy();
    const notes = after.notes as { text: string }[];
    expect(notes).toHaveLength(1);
  });

  it("LOST requires a reason; a manual move to ORDERED is refused", async () => {
    const l = await newLead();
    await expect(moveLead(l.id, "LOST", USER)).rejects.toBeInstanceOf(LeadError);
    await expect(moveLead(l.id, "ORDERED", USER)).rejects.toBeInstanceOf(LeadError);
    const lost = await moveLead(l.id, "LOST", USER, "PRICE");
    expect(lost.status).toBe("LOST");
    expect(lost.lostReason).toBe("PRICE");
    // A lost lead can be reopened.
    const reopened = await moveLead(l.id, "NEW", USER);
    expect(reopened.status).toBe("NEW");
    expect(reopened.lostReason).toBeNull();
  });

  it("🏆 convert to order creates a retail sale, links it, marks ORDERED, and is one-shot", async () => {
    const l = await newLead();
    const order = await convertToOrder(
      { leadId: l.id, productId, qty: 5, channelId: RETAIL, entityId: ENTITY, warehouseId: MAIN, discountRate: 0 },
      USER,
    );
    created.orders.push(order.id);

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
    expect(lead.status).toBe("ORDERED");
    expect(lead.convertedOrderId).toBe(order.id);

    const so = await prisma.salesOrder.findUniqueOrThrow({ where: { id: order.id }, include: { lines: true } });
    expect(so.customerName).toBe(lead.contact);
    expect(so.lines[0].qty).toBe(5);

    // Converting again is refused.
    await expect(
      convertToOrder({ leadId: l.id, productId, qty: 1, channelId: RETAIL, entityId: ENTITY, warehouseId: MAIN }, USER),
    ).rejects.toBeInstanceOf(LeadError);
  });

  it("campaign analytics: conversion, revenue (net), CAC and ROI from real data", async () => {
    // Fresh campaign in isolation: 4 leads, 1 converted at 10 × 100 000 (retail 35% → net 65 000/unit).
    const campaign = "LEADTEST-roi";
    const cost = await prisma.costEntry.create({
      data: { scope: "FIXED", category: "MARKETING_BRAND", entityId: ENTITY, campaign, amount: new Prisma.Decimal(500_000), currency: "UZS", rate: new Prisma.Decimal(1), amountUZS: new Prisma.Decimal(500_000), date: new Date() },
    });
    created.costs.push(cost.id);
    for (let i = 0; i < 3; i++) await newLead(campaign); // 3 unconverted
    const conv = await newLead(campaign);
    const order = await convertToOrder(
      { leadId: conv.id, productId, qty: 10, channelId: RETAIL, entityId: ENTITY, warehouseId: MAIN, discountRate: 0.35 },
      USER,
    );
    created.orders.push(order.id);

    const { rows } = await campaignAnalytics();
    const r = rows.find((x) => x.campaign === campaign)!;
    expect(r.leads).toBe(4);
    expect(r.converted).toBe(1);
    expect(r.conversionRate.toNumber()).toBe(0.25);
    // net = 10 × 100 000 × 0.65 = 650 000
    expect(r.revenue.toNumber()).toBe(650_000);
    expect(r.cac!.toNumber()).toBe(500_000); // 500k / 1
    expect(r.roi!.toNumber()).toBeCloseTo(0.3, 6); // (650k − 500k) / 500k
  });

  it("lists leads bucketed by status for the kanban", async () => {
    const cols = await import("@/lib/services/leads-service").then((m) => m.listLeadsByStatus());
    expect(cols.NEW).toBeDefined();
    expect(cols.ORDERED.length).toBeGreaterThanOrEqual(1);
    expect(Object.keys(cols).sort()).toEqual(["CONTACTED", "LOST", "NEW", "ORDERED"]);
  });
});
