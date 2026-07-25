import Link from "next/link";
import { Radio, Undo2, Wallet } from "lucide-react";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { orderTotals } from "@/lib/sales";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/shared/kpi-card";
import { formatUZS } from "@/lib/format";
import { OrdersClient, type OrderRow, type NewOrderRefs } from "./orders-client";

export const metadata = { title: "Sotuv buyurtmalari" };

export default async function SalesOrdersPage() {
  const user = await requirePermission("sales.read");

  const [orders, channels, entities, warehouses, partners, products] = await Promise.all([
    prisma.salesOrder.findMany({
      include: {
        channel: { select: { name: true, type: true, feeRate: true } },
        entity: { select: { name: true } },
        partner: { select: { name: true } },
        lines: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.salesChannel.findMany({
      where: { archivedAt: null },
      select: { id: true, name: true, type: true, defaultDiscount: true, feeRate: true },
      orderBy: { name: "asc" },
    }),
    prisma.entity.findMany({
      where: { archivedAt: null },
      select: { id: true, name: true },
      orderBy: { code: "asc" },
    }),
    prisma.warehouse.findMany({
      where: { archivedAt: null, type: { not: "AGENT" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.partner.findMany({
      where: { archivedAt: null, roles: { has: "CLIENT" } },
      select: { id: true, name: true, creditLimit: true, isBlocked: true },
      orderBy: { name: "asc" },
    }),
    prisma.product.findMany({
      where: { archivedAt: null },
      select: {
        id: true,
        sku: true,
        listPrice: true,
        titleId: true,
        title: { select: { workTitle: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
  ]);

  const rows: OrderRow[] = orders.map((o) => {
    const t = orderTotals(
      o.lines.map((l) => ({
        qty: l.qty,
        unitPrice: l.unitPrice,
        discountRate: l.discountRate,
        channelFeeRate: new Prisma.Decimal(o.channel.feeRate),
        cogsUnit: l.cogsUnit,
        deliveryCostUnit: l.deliveryCostUnit ?? 0,
      })),
    );
    return {
      id: o.id,
      status: o.status,
      channel: o.channel.name,
      channelType: o.channel.type,
      entity: o.entity.name,
      customer: o.partner?.name ?? o.customerName ?? "—",
      orderDate: o.orderDate.toISOString(),
      units: t.units,
      gross: t.gross.toNumber(),
      net: t.net.toNumber(),
      cm: t.cm.toNumber(),
      // CM is only real once the line is shipped and sealed.
      sealed: o.lines.length > 0 && o.lines.every((l) => l.cmUnit != null),
    };
  });

  const shipped = rows.filter((r) => r.sealed);
  const openNet = rows
    .filter((r) => !["CANCELLED", "PAID"].includes(r.status))
    .reduce((a, r) => a + r.net, 0);

  const refs: NewOrderRefs = {
    channels: channels.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      defaultDiscount: Number(c.defaultDiscount),
      feeRate: Number(c.feeRate),
    })),
    entities,
    warehouses,
    partners: partners.map((p) => ({
      id: p.id,
      name: p.name,
      creditLimit: p.creditLimit ? Number(p.creditLimit) : null,
      isBlocked: p.isBlocked,
    })),
    products: products.map((p) => ({
      id: p.id,
      sku: p.sku,
      titleId: p.titleId,
      workTitle: p.title.workTitle,
      listPrice: Number(p.listPrice),
    })),
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Sotuv buyurtmalari</h1>
        <div className="flex gap-2">
          <Button variant="outline" render={<Link href="/sales/channels" />}>
            <Radio className="size-4" /> Kanallar
          </Button>
          <Button variant="outline" render={<Link href="/sales/receivables" />}>
            <Wallet className="size-4" /> Qarzlar
          </Button>
          <Button variant="outline" render={<Link href="/sales/returns" />}>
            <Undo2 className="size-4" /> Qaytishlar
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Buyurtmalar" value={rows.length} hint="Oxirgi 200 hujjat" />
        <KpiCard
          title="Ochiq buyurtma qiymati"
          value={formatUZS(openNet)}
          hint="Bekor qilinmagan va toʻlanmagan buyurtmalarning sof qiymati"
        />
        <KpiCard
          title="Muhrlangan marja (CM)"
          value={formatUZS(shipped.reduce((a, r) => a + r.cm, 0))}
          hint="Faqat joʻnatilgan qatorlar — cmUnit joʻnatishda muhrlanadi"
        />
        <KpiCard
          title="Joʻnatilgan nusxa"
          value={shipped.reduce((a, r) => a + r.units, 0).toLocaleString("ru-RU")}
          hint="FIFO orqali chiqqan nusxalar"
        />
      </div>

      <OrdersClient
        rows={rows}
        refs={refs}
        canWrite={user.permissions.includes("sales.write")}
        canOverride={user.permissions.includes("admin.settings")}
      />
    </div>
  );
}
