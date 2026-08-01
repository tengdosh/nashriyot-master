import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePermission, entityFilter } from "@/lib/rbac";
import { getSalesOrder } from "@/lib/services/sales-service";
import { Button } from "@/components/ui/button";
import { OrderCard, type OrderCardLine } from "./order-card";

export const metadata = { title: "Buyurtma" };

export default async function SalesOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission("sales.read");

  let data: Awaited<ReturnType<typeof getSalesOrder>>;
  try {
    data = await getSalesOrder(id);
  } catch {
    notFound();
  }

  const eIds = entityFilter(user);
  if (eIds !== null && !eIds.includes(data.order.entityId)) notFound();

  const { order, lines, totals } = data;

  const lineRows: OrderCardLine[] = lines.map((l) => ({
    id: l.line.id,
    workTitle: l.line.product.title.workTitle,
    sku: l.line.product.sku,
    format: l.line.product.format,
    qty: l.line.qty,
    returnedQty: l.returnedQty,
    unitPrice: Number(l.line.unitPrice),
    discountRate: Number(l.line.discountRate),
    netUnit: l.economics.netUnit.toNumber(),
    channelFeeUnit: l.economics.channelFeeUnit.toNumber(),
    cogsUnit: l.line.cogsUnit != null ? Number(l.line.cogsUnit) : null,
    cmUnit: l.line.cmUnit != null ? Number(l.line.cmUnit) : null,
    deliveryCostUnit: l.line.deliveryCostUnit != null ? Number(l.line.deliveryCostUnit) : 0,
    sealed: l.sealed,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {order.partner?.name ?? order.customerName ?? "Buyurtma"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {order.channel.name} · {order.entity.name} · {order.warehouse.name}
          </p>
        </div>
        <Button variant="outline" render={<Link href="/sales/orders" />}>
          <ArrowLeft className="size-4" /> Buyurtmalarga
        </Button>
      </div>

      <OrderCard
        orderId={order.id}
        status={order.status}
        channelType={order.channel.type}
        channelFeeRate={Number(order.channel.feeRate)}
        lines={lineRows}
        totals={{
          gross: totals.gross.toNumber(),
          net: totals.net.toNumber(),
          cm: totals.cm.toNumber(),
          cogs: totals.cogs.toNumber(),
          units: totals.units,
          cmRate: totals.cmRate.toNumber(),
        }}
        receivable={
          order.receivable
            ? {
                id: order.receivable.id,
                amountUZS: Number(order.receivable.amountUZS),
                paidUZS: Number(order.receivable.paidUZS),
                status: order.receivable.status,
                dueDate: order.receivable.dueDate?.toISOString() ?? null,
              }
            : null
        }
        dates={{
          orderDate: order.orderDate.toISOString(),
          shippedDate: order.shippedDate?.toISOString() ?? null,
          invoicedDate: order.invoicedDate?.toISOString() ?? null,
          paidDate: order.paidDate?.toISOString() ?? null,
        }}
        canWrite={user.permissions.includes("sales.write")}
        canPay={user.permissions.includes("finance.write")}
      />
    </div>
  );
}
