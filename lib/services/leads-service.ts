import { Prisma, type LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runWithAudit } from "@/lib/audit-context";
import { leadStaleness, campaignMetrics, campaignTotals } from "@/lib/leads";
import { orderTotals } from "@/lib/sales";
import { createSalesOrder } from "./sales-service";
import type { LeadCreateInput, LeadNoteInput, LeadLostInput, LeadConvertInput } from "@/lib/validators/leads";

/**
 * CRM leads (spec v2 §5.3). Kanban NEW → CONTACTED → ORDERED / LOST. A lead is
 * "converted" by creating a real M6 retail sales order (not a shortcut), so the
 * revenue it produces flows through the same sealed pipeline as any other sale.
 */

export class LeadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeadError";
  }
}

const OPEN_STATUSES: LeadStatus[] = ["NEW", "CONTACTED"];

/** Manual moves allowed on the board. ORDERED is reached only via convertToOrder. */
const LEAD_FLOW: Record<LeadStatus, LeadStatus[]> = {
  NEW: ["CONTACTED", "LOST"],
  CONTACTED: ["LOST"],
  ORDERED: [],
  LOST: ["NEW"], // reopen a lost lead
};

type NoteEntry = { at: string; text: string };

export async function listLeadsByStatus(now: Date = new Date()) {
  const leads = await prisma.lead.findMany({
    include: {
      interestTitle: { select: { workTitle: true } },
      assignee: { select: { fullName: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const view = leads.map((l) => {
    const open = OPEN_STATUSES.includes(l.status);
    const lastActivity = l.lastContactAt ?? l.createdAt;
    return {
      id: l.id,
      source: l.source,
      campaign: l.campaign,
      contact: l.contact,
      status: l.status,
      interestTitle: l.interestTitle?.workTitle ?? null,
      interestTitleId: l.interestTitleId,
      assignee: l.assignee?.fullName ?? null,
      lostReason: l.lostReason,
      convertedOrderId: l.convertedOrderId,
      noteCount: Array.isArray(l.notes) ? (l.notes as unknown[]).length : 0,
      lastContactAt: l.lastContactAt?.toISOString() ?? null,
      staleness: leadStaleness(lastActivity, now, open),
    };
  });

  const columns: Record<LeadStatus, typeof view> = { NEW: [], CONTACTED: [], ORDERED: [], LOST: [] };
  for (const l of view) columns[l.status].push(l);
  return columns;
}

export async function createLead(input: LeadCreateInput, userId: string) {
  return runWithAudit({ userId }, async () =>
    prisma.lead.create({
      data: {
        source: input.source,
        campaign: input.campaign ?? null,
        contact: input.contact,
        interestTitleId: input.interestTitleId ?? null,
        assigneeId: input.assigneeId ?? null,
        status: "NEW",
      },
    }),
  );
}

export async function moveLead(leadId: string, to: LeadStatus, userId: string, lostReason?: LeadLostInput["lostReason"]) {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  if (to === "ORDERED") {
    throw new LeadError("ORDERED holatiga faqat buyurtmaga aylantirish orqali oʻtiladi");
  }
  if (!LEAD_FLOW[lead.status]?.includes(to)) {
    throw new LeadError(`Holat oʻtishi taqiqlangan: ${lead.status} → ${to}`);
  }
  if (to === "LOST" && !lostReason) {
    throw new LeadError("Yoʻqotilgan lid uchun sabab majburiy");
  }
  return runWithAudit({ userId }, async () =>
    prisma.lead.update({
      where: { id: leadId },
      data: {
        status: to,
        lostReason: to === "LOST" ? lostReason : to === "NEW" ? null : undefined,
      },
    }),
  );
}

export async function addNote(input: LeadNoteInput, userId: string) {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: input.leadId } });
  const notes: NoteEntry[] = Array.isArray(lead.notes) ? (lead.notes as unknown as NoteEntry[]) : [];
  notes.push({ at: new Date().toISOString(), text: input.text });
  // Adding a note counts as contact: bump lastContactAt (clears the stale flag)
  // and advance a fresh NEW lead to CONTACTED.
  return runWithAudit({ userId }, async () =>
    prisma.lead.update({
      where: { id: input.leadId },
      data: {
        notes: notes as unknown as Prisma.InputJsonValue,
        lastContactAt: new Date(),
        status: lead.status === "NEW" ? "CONTACTED" : undefined,
      },
    }),
  );
}

/**
 * Convert a lead to a retail sale: create a real M6 sales order, link it, and
 * mark the lead ORDERED. Idempotent guard: a lead can only be converted once.
 */
export async function convertToOrder(input: LeadConvertInput, userId: string) {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: input.leadId } });
  if (lead.convertedOrderId || lead.status === "ORDERED") {
    throw new LeadError("Bu lid allaqachon buyurtmaga aylantirilgan");
  }

  const { order } = await createSalesOrder(
    {
      channelId: input.channelId,
      entityId: input.entityId,
      warehouseId: input.warehouseId,
      customerName: lead.contact,
      lines: [
        {
          productId: input.productId,
          qty: input.qty,
          discountRate: input.discountRate,
          deliveryCostUnit: input.deliveryCostUnit,
        },
      ],
    },
    userId,
  );

  await runWithAudit({ userId }, async () =>
    prisma.lead.update({
      where: { id: input.leadId },
      data: { status: "ORDERED", convertedOrderId: order.id, lastContactAt: new Date() },
    }),
  );
  return order;
}

export async function getLead(leadId: string) {
  return prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
    include: {
      interestTitle: { select: { workTitle: true } },
      assignee: { select: { fullName: true } },
      convertedOrder: { select: { id: true, status: true } },
    },
  });
}

// ── Campaign analytics (spec v2 §5.3) ─────────────────────────────────────────

/**
 * Per-campaign funnel. Revenue is the SEALED net of the converted leads' sales
 * orders; cost is marketing cost_entries tagged with the same campaign.
 */
export async function campaignAnalytics() {
  const leads = await prisma.lead.findMany({
    select: { campaign: true, status: true, convertedOrderId: true },
  });

  // Revenue per converted order (net, via M6 sealed lines).
  const convertedIds = leads.map((l) => l.convertedOrderId).filter((x): x is string => !!x);
  const orders = convertedIds.length
    ? await prisma.salesOrder.findMany({
        where: { id: { in: convertedIds } },
        include: { lines: true, channel: { select: { feeRate: true } } },
      })
    : [];
  const revenueByOrder = new Map(
    orders.map((o) => [
      o.id,
      orderTotals(
        o.lines.map((l) => ({
          qty: l.qty,
          unitPrice: l.unitPrice,
          discountRate: l.discountRate,
          channelFeeRate: new Prisma.Decimal(o.channel.feeRate),
          cogsUnit: l.cogsUnit,
          deliveryCostUnit: l.deliveryCostUnit ?? 0,
        })),
      ).net,
    ]),
  );

  const costs = await prisma.costEntry.groupBy({
    by: ["campaign"],
    where: { campaign: { not: null } },
    _sum: { amountUZS: true },
  });
  const costByCampaign = new Map(costs.map((c) => [c.campaign ?? "", new Prisma.Decimal(c._sum.amountUZS ?? 0)]));

  const byCampaign = new Map<string, { leads: number; converted: number; revenue: Prisma.Decimal }>();
  for (const l of leads) {
    const key = l.campaign ?? "(kampaniyasiz)";
    const e = byCampaign.get(key) ?? { leads: 0, converted: 0, revenue: new Prisma.Decimal(0) };
    e.leads += 1;
    if (l.convertedOrderId) {
      e.converted += 1;
      e.revenue = e.revenue.plus(revenueByOrder.get(l.convertedOrderId) ?? 0);
    }
    byCampaign.set(key, e);
  }

  const rows = [...byCampaign.entries()]
    .map(([campaign, e]) =>
      campaignMetrics({
        campaign,
        leads: e.leads,
        converted: e.converted,
        revenue: e.revenue,
        cost: costByCampaign.get(campaign) ?? 0,
      }),
    )
    .sort((a, b) => b.revenue.comparedTo(a.revenue));

  return { rows, totals: campaignTotals(rows) };
}
