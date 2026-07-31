// check:entity-ok: primary model has no entityId — this module is company-wide
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { abcClassify, serviceLevelZFor } from "@/lib/inventory-analytics";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/shared/kpi-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { InfoHint } from "@/components/shared/info-hint";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatNumber, formatUZS } from "@/lib/format";
import { RecalcAbcButton } from "./recalc-button";

export const metadata = { title: "ABC tasnifi" };

const TONE = { A: "success", B: "warning", C: "muted" } as const;

/**
 * The curve is recomputed here for display so the page is never stale relative
 * to today's sales; the nightly job is what PERSISTS Product.abcClass (which the
 * ROP monitor reads for its service level).
 */
export default async function AbcPage() {
  const user = await requirePermission("inventory.read");
  const now = new Date();
  const from = new Date(now.getTime() - 365 * 86_400_000);

  const [products, sold] = await Promise.all([
    prisma.product.findMany({
      where: { archivedAt: null },
      select: {
        id: true,
        sku: true,
        listPrice: true,
        abcClass: true,
        title: { select: { workTitle: true } },
      },
    }),
    prisma.stockMovement.groupBy({
      by: ["productId"],
      where: { type: "OUT", date: { gte: from } },
      _sum: { qty: true },
    }),
  ]);
  const qtyById = new Map(sold.map((s) => [s.productId, s._sum.qty ?? 0]));

  const rows = abcClassify(
    products.map((p) => ({
      item: { ...p, units: qtyById.get(p.id) ?? 0 },
      revenue: Number(p.listPrice) * (qtyById.get(p.id) ?? 0),
    })),
  );

  const counts = { A: 0, B: 0, C: 0 };
  for (const r of rows) counts[r.abcClass] += 1;
  const totalRevenue = rows.reduce((a, r) => a + r.revenue.toNumber(), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">ABC tasnifi</h1>
        <div className="flex gap-2">
          {user.permissions.includes("admin.settings") && <RecalcAbcButton />}
          <Button variant="outline" render={<Link href="/inventory" />}>
            <ArrowLeft className="size-4" /> Omborga
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Yillik tushum"
          value={formatUZS(totalRevenue)}
          hint="Oxirgi 365 kunda chiqqan nusxalar × asosiy narx (M6 dan keyin muhrlangan sof tushum)"
        />
        <KpiCard title="A sinf" value={counts.A} hint="Kumulyativ 0–80% · xizmat darajasi 99%" />
        <KpiCard title="B sinf" value={counts.B} hint="80–95% · 95%" />
        <KpiCard title="C sinf" value={counts.C} hint="95–100% · 90%" />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Asar / SKU</TableHead>
              <TableHead className="text-right">Sotilgan</TableHead>
              <TableHead className="text-right">Tushum</TableHead>
              <TableHead className="text-right">Ulush</TableHead>
              <TableHead className="text-right">
                <span className="inline-flex items-center gap-1">
                  Kumulyativ
                  <InfoHint>
                    Tushum boʻyicha kamayish tartibida yigʻilgan ulush. Sinf SKU qaysi nuqtada boshlanishiga
                    qarab beriladi, shuning uchun chegarani kesib oʻtgan SKU yuqori sinfda qoladi.
                  </InfoHint>
                </span>
              </TableHead>
              <TableHead>Sinf</TableHead>
              <TableHead className="text-right">Z</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  Maʼlumot yoʻq
                </TableCell>
              </TableRow>
            )}
            {rows.map((r, i) => (
              <TableRow key={r.item.id}>
                <TableCell className="tabular-nums text-muted-foreground">{i + 1}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{r.item.title.workTitle}</span>
                    <span className="text-xs text-muted-foreground">{r.item.sku ?? "—"}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(r.item.units)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatUZS(r.revenue.toNumber())}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {(r.share.toNumber() * 100).toFixed(1)}%
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {(r.cumulative.toNumber() * 100).toFixed(1)}%
                </TableCell>
                <TableCell>
                  <StatusBadge status={r.abcClass} tone={TONE[r.abcClass]} label={r.abcClass} />
                  {r.item.abcClass && r.item.abcClass !== r.abcClass && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      (saqlangan: {r.item.abcClass})
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {serviceLevelZFor(r.abcClass).toString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
