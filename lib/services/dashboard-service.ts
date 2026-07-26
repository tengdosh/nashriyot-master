import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runWithAudit } from "@/lib/audit-context";
import {
  normalizeLayout,
  roleDefaultLayout,
  resolveVisibleWidgets,
  type WidgetLayout,
} from "@/lib/dashboard";
import { channelProfitability, topTitles } from "./analytics-service";

/**
 * Dashboard service (spec v1 §5.9). Every widget reads ONLY the materialized
 * views or the notifications/tasks tables — never a heavy live aggregation — so
 * the board stays cheap no matter how many widgets a user pins.
 */

/** The user's stored layout, or their primary role's default. */
export async function getLayout(userId: string, roles: string[]): Promise<WidgetLayout[]> {
  const stored = await prisma.dashboardLayout.findUnique({ where: { userId } });
  if (stored) return normalizeLayout(stored.widgets);
  return roleDefaultLayout(roles[0] ?? "");
}

export async function getVisibleWidgets(userId: string, roles: string[], permissions: string[]) {
  return resolveVisibleWidgets(await getLayout(userId, roles), permissions);
}

export async function saveLayout(userId: string, widgets: WidgetLayout[]) {
  const normalized = normalizeLayout(widgets);
  return runWithAudit({ userId }, async () =>
    prisma.dashboardLayout.upsert({
      where: { userId },
      update: { widgets: normalized as unknown as Prisma.InputJsonValue },
      create: { userId, widgets: normalized as unknown as Prisma.InputJsonValue },
    }),
  );
}

/** Reset to the role default by deleting the override. */
export async function resetLayout(userId: string) {
  return runWithAudit({ userId }, async () =>
    prisma.dashboardLayout.deleteMany({ where: { userId } }),
  );
}

// ── Widget data providers (view-only) ─────────────────────────────────────────

function ytdWindow(now = new Date()) {
  const y = now.getUTCFullYear();
  return { from: `${y}-01`, to: `${y}-12` };
}

/** KPI row: YTD net revenue, COGS, CM, units from mv_monthly_sales. */
export async function kpiSummary(now = new Date()) {
  const { from, to } = ytdWindow(now);
  const rows = await prisma.$queryRaw<{ net: string; cogs: string; cm: string; units: number }[]>`
    SELECT COALESCE(SUM(net_revenue),0)::text AS net,
           COALESCE(SUM(cogs),0)::text AS cogs,
           COALESCE(SUM(cm),0)::text AS cm,
           COALESCE(SUM(units),0)::int AS units
    FROM mv_monthly_sales WHERE month >= ${from} AND month <= ${to}
  `;
  const r = rows[0] ?? { net: "0", cogs: "0", cm: "0", units: 0 };
  const net = new Prisma.Decimal(r.net);
  const cm = new Prisma.Decimal(r.cm);
  return {
    netRevenue: net,
    cogs: new Prisma.Decimal(r.cogs),
    cm,
    units: r.units,
    cmRate: net.gt(0) ? cm.div(net) : new Prisma.Decimal(0),
  };
}

/** 12 trailing months of net revenue (fills empty months with zero). */
export async function monthlyRevenue(now = new Date()) {
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const rows = await prisma.$queryRaw<{ month: string; net: string; cm: string }[]>`
    SELECT month, SUM(net_revenue)::text AS net, SUM(cm)::text AS cm
    FROM mv_monthly_sales WHERE month >= ${months[0]} AND month <= ${months[11]}
    GROUP BY month
  `;
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  return months.map((m) => ({
    month: m,
    net: Number(byMonth.get(m)?.net ?? 0),
    cm: Number(byMonth.get(m)?.cm ?? 0),
  }));
}

/** Unread notifications for the alerts widget (each links to its fix screen). */
export async function alerts(roles: string[], take = 8) {
  return prisma.notification.findMany({
    where: {
      isRead: false,
      OR: [{ targetRole: null }, { targetRole: { in: roles } }],
    },
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    take,
  });
}

/** Channel donut: net revenue share per channel (from mv). */
export async function channelDonut() {
  const rows = await channelProfitability();
  const total = rows.reduce((a, r) => a.plus(r.netRevenue), new Prisma.Decimal(0));
  return {
    total,
    slices: rows.map((r) => ({
      channel: r.channel,
      netRevenue: r.netRevenue,
      share: total.gt(0) ? r.netRevenue.div(total).toNumber() : 0,
    })),
  };
}

export async function dashboardTopTitles() {
  const rows = await topTitles(10);
  return rows.map((t) => ({ workTitle: t.item.work_title, value: t.value }));
}

/** Overdue production tasks: past due date and not DONE. */
export async function overdueTasks(now = new Date(), take = 10) {
  const tasks = await prisma.productionTask.findMany({
    where: { dueDate: { lt: now }, status: { not: "DONE" } },
    include: { title: { select: { workTitle: true } }, assignee: { select: { fullName: true } } },
    orderBy: { dueDate: "asc" },
    take,
  });
  return tasks.map((t) => ({
    id: t.id,
    name: t.name,
    workTitle: t.title.workTitle,
    assignee: t.assignee?.fullName ?? null,
    dueDate: t.dueDate!,
    daysOverdue: Math.floor((now.getTime() - t.dueDate!.getTime()) / 86_400_000),
  }));
}

/** AR mini: outstanding per aging bucket from mv_ar_aging. */
export async function arMini() {
  const rows = await prisma.$queryRaw<{ bucket: string; outstanding: string }[]>`
    SELECT bucket, SUM(outstanding)::text AS outstanding FROM mv_ar_aging GROUP BY bucket
  `;
  const byBucket = new Map(rows.map((r) => [r.bucket, new Prisma.Decimal(r.outstanding)]));
  const get = (b: string) => byBucket.get(b) ?? new Prisma.Decimal(0);
  const total = rows.reduce((a, r) => a.plus(r.outstanding), new Prisma.Decimal(0));
  const overdue = total.minus(get("CURRENT"));
  return {
    total,
    overdue,
    buckets: {
      CURRENT: get("CURRENT"),
      D0_30: get("D0_30"),
      D31_60: get("D31_60"),
      D61_90: get("D61_90"),
      D90_PLUS: get("D90_PLUS"),
    },
  };
}
