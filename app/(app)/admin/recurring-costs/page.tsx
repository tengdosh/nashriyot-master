import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { listRecurringCosts } from "@/lib/services/recurring-cost-service";
import { Button } from "@/components/ui/button";
import { RecurringCostsClient, type RecurringCostRow, type RefData } from "./recurring-costs-client";

export const metadata = { title: "Takroriy xarajatlar" };

export default async function RecurringCostsPage() {
  await requirePermission("admin.settings");

  const [costs, entities] = await Promise.all([
    listRecurringCosts(),
    prisma.entity.findMany({
      where:   { archivedAt: null },
      select:  { id: true, name: true },
      orderBy: { code: "asc" },
    }),
  ]);

  const rows: RecurringCostRow[] = costs.map((c) => ({
    id:         c.id,
    entityId:   c.entityId,
    entityName: c.entity.name,
    label:      c.label,
    amount:     Number(c.amount),
    currency:   c.currency as string,
    rate:       Number(c.rate),
    category:   c.category as string,
    scope:      c.scope,
    dayOfMonth: c.dayOfMonth,
    startMonth: c.startMonth,
    endMonth:   c.endMonth ?? null,
    lastRunAt:  c.lastRunAt?.toISOString() ?? null,
    archivedAt: c.archivedAt?.toISOString() ?? null,
  }));

  const refs: RefData = {
    entities,
    currentMonth: new Date().toISOString().slice(0, 7),
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Takroriy xarajatlar</h1>
          <p className="text-sm text-muted-foreground">
            Har oy avtomatik CostEntry yaratadigan shablonlar. Kunlik 00:30 da ishlaydi.
          </p>
        </div>
        <Button variant="outline" render={<Link href="/admin" />}>
          <ArrowLeft className="size-4" /> Administratsiya
        </Button>
      </div>
      <RecurringCostsClient rows={rows} refs={refs} />
    </div>
  );
}
