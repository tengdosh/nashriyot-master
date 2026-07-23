import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { PrintOrdersClient, type OrderRow, type EditionOpt } from "./print-orders-client";

export const metadata = { title: "Print orderlar" };

export default async function PrintOrdersPage() {
  const user = await requirePermission("production.read");
  const [orders, editions, printers, warehouses] = await Promise.all([
    prisma.printOrder.findMany({
      include: {
        edition: { include: { title: { select: { workTitle: true } } } },
        printer: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.edition.findMany({
      include: { title: { select: { workTitle: true } }, products: { select: { id: true, format: true } } },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    prisma.partner.findMany({
      where: { roles: { has: "PRINTER" }, archivedAt: null },
      select: { id: true, name: true, currency: true },
    }),
    prisma.warehouse.findMany({
      where: { type: { in: ["MAIN", "SALES"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const orderRows: OrderRow[] = orders.map((o) => ({
    id: o.id,
    title: o.edition?.title.workTitle ?? "—",
    editionNo: o.edition?.editionNo ?? null,
    printer: o.printer.name,
    qty: o.quantity,
    currency: o.currency,
    unitPPB: Number(o.unitPPB),
    rate: Number(o.rate),
    unitUZS: Number(o.unitPPB) * Number(o.rate),
    status: o.status,
    receivedQty: o.receivedQty,
  }));

  const editionOpts: EditionOpt[] = editions
    .filter((e) => e.products.length > 0)
    .map((e) => ({
      id: e.id,
      label: `${e.title.workTitle} — ${e.editionNo}-nashr`,
      products: e.products.map((p) => ({ id: p.id, format: p.format })),
    }));

  return (
    <PrintOrdersClient
      orders={orderRows}
      editions={editionOpts}
      printers={printers}
      warehouses={warehouses}
      canWrite={user.permissions.includes("production.write")}
    />
  );
}
