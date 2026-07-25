import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { channelKpi } from "@/lib/sales";
import { Button } from "@/components/ui/button";
import { ChannelsClient, type ChannelCard } from "./channels-client";

export const metadata = { title: "Sotuv kanallari" };

/** Trailing 6 months of sealed line data, grouped per channel per month. */
function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function ChannelsPage() {
  const user = await requirePermission("sales.read");
  const from = new Date();
  from.setMonth(from.getMonth() - 5);
  from.setDate(1);

  const [channels, lines] = await Promise.all([
    prisma.salesChannel.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } }),
    prisma.salesOrderLine.findMany({
      where: {
        order: { status: { in: ["SHIPPED", "INVOICED", "PAID"] }, shippedDate: { gte: from } },
      },
      select: {
        qty: true,
        unitPrice: true,
        discountRate: true,
        cogsUnit: true,
        cmUnit: true,
        deliveryCostUnit: true,
        order: { select: { channelId: true, shippedDate: true, channel: { select: { feeRate: true } } } },
      },
    }),
  ]);

  const cards: ChannelCard[] = channels.map((c) => {
    const mine = lines.filter((l) => l.order.channelId === c.id);
    const kpi = channelKpi(c.type, mine.map((l) => ({
      qty: l.qty,
      unitPrice: l.unitPrice,
      discountRate: l.discountRate,
      channelFeeRate: new Prisma.Decimal(l.order.channel.feeRate),
      cogsUnit: l.cogsUnit,
      deliveryCostUnit: l.deliveryCostUnit ?? 0,
    })));

    // Monthly CM straight from the SEALED cmUnit — never recomputed.
    const byMonth = new Map<string, number>();
    for (const l of mine) {
      if (!l.order.shippedDate || l.cmUnit == null) continue;
      const k = monthKey(l.order.shippedDate);
      byMonth.set(k, (byMonth.get(k) ?? 0) + Number(l.cmUnit) * l.qty);
    }
    const months: { month: string; cm: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const k = monthKey(d);
      months.push({ month: k, cm: byMonth.get(k) ?? 0 });
    }

    return {
      id: c.id,
      name: c.name,
      type: c.type,
      defaultDiscount: Number(c.defaultDiscount),
      feeRate: Number(c.feeRate),
      paymentTermDays: c.paymentTermDays,
      units: kpi.units,
      gross: kpi.gross.toNumber(),
      net: kpi.net.toNumber(),
      cm: kpi.cm.toNumber(),
      cmRate: kpi.cmRate.toNumber(),
      headlineMetric: kpi.headlineMetric,
      months,
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sotuv kanallari</h1>
          <p className="text-sm text-muted-foreground">
            Sozlama faqat YANGI buyurtmaga tushadi — muhrlangan qatorlarga tegmaydi.
          </p>
        </div>
        <Button variant="outline" render={<Link href="/sales/orders" />}>
          <ArrowLeft className="size-4" /> Buyurtmalarga
        </Button>
      </div>

      <ChannelsClient cards={cards} canWrite={user.permissions.includes("sales.write")} />
    </div>
  );
}
