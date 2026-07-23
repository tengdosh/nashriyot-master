import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { MoneyText } from "@/components/shared/money";
import { EmptyState } from "@/components/shared/states";

export const metadata = { title: "Akvizitsiya" };

export default async function AcquisitionsPage() {
  await requirePermission("acquisitions.read");
  const scenarios = await prisma.plScenario.findMany({
    include: { title: { select: { workTitle: true } } },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Akvizitsiya &amp; P&amp;L</h1>
        <Button render={<Link href="/acquisitions/new" />}>
          <Plus className="size-4" /> Yangi ssenariy
        </Button>
      </div>

      {scenarios.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {scenarios.map((s) => {
            const r = (s.results as { uc?: number; rrp?: number } | null) ?? null;
            return (
              <Link
                key={s.id}
                href={`/acquisitions/${s.id}`}
                className="flex flex-col gap-1 rounded-lg border p-4 transition-colors hover:bg-muted/40"
              >
                <div className="font-medium">{s.name}</div>
                <div className="text-sm text-muted-foreground">{s.title?.workTitle ?? "— (bogʻlanmagan)"}</div>
                <div className="mt-2 flex gap-4 text-sm">
                  <span className="text-muted-foreground">
                    UC: <MoneyText value={r?.uc ?? 0} className="text-foreground" />
                  </span>
                  <span className="text-muted-foreground">
                    RRP: <MoneyText value={r?.rrp ?? 0} className="text-foreground" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState description="Hali ssenariy yoʻq. «Yangi ssenariy» tugmasi bilan boshlang." />
      )}
    </div>
  );
}
