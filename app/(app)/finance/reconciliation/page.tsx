import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePermission, entityFilter } from "@/lib/rbac";
import { reconciliation } from "@/lib/services/finance-service";
import { Button } from "@/components/ui/button";
import { ReconciliationClient, type PendingView, type PartnerOption } from "./reconciliation-client";

export const metadata = { title: "Bank solishtiruvi" };

export default async function ReconciliationPage() {
  const user = await requirePermission("finance.read");
  const eIds = entityFilter(user);
  const [{ pending }, partners] = await Promise.all([
    reconciliation([], {}, eIds),
    prisma.partner.findMany({ where: { archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const view: PendingView[] = pending.map((p) => ({
    id: p.id,
    direction: p.direction,
    method: p.method,
    entityName: p.entityName,
    partnerId: p.partnerId,
    partnerName: p.partnerName,
    amount: p.amount.toNumber(),
    date: p.date.toISOString(),
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Bank solishtiruvi</h1>
        <Button variant="outline" render={<Link href="/finance" />}>
          <ArrowLeft className="size-4" /> Moliya markazi
        </Button>
      </div>

      <ReconciliationClient
        pending={view}
        partners={partners as PartnerOption[]}
        canReconcile={user.permissions.includes("finance.reconcile")}
      />
    </div>
  );
}
