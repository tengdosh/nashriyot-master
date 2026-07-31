// check:entity-ok: primary model has no entityId — this module is company-wide
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { monthlyHistory, latestForecast } from "@/lib/services/forecast-service";
import { Button } from "@/components/ui/button";
import { ForecastClient, type ProductOption, type ForecastView } from "./forecast-client";

export const metadata = { title: "Talab prognozi" };

export default async function ForecastPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const user = await requirePermission("ai.read");
  const { product } = await searchParams;

  const products = await prisma.product.findMany({
    where: { archivedAt: null },
    select: { id: true, sku: true, title: { select: { workTitle: true } } },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  const options: ProductOption[] = products.map((p) => ({ id: p.id, sku: p.sku, workTitle: p.title.workTitle }));

  const selected = product ?? options[0]?.id ?? "";
  let view: ForecastView | null = null;
  if (selected) {
    const [history, forecast] = await Promise.all([monthlyHistory(selected), latestForecast(selected)]);
    view = {
      productId: selected,
      history,
      forecast: forecast
        ? {
            id: forecast.id,
            values: forecast.values as { month: string; value: number }[],
            mape: forecast.mape != null ? Number(forecast.mape) : null,
          }
        : null,
    };
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Talab prognozi</h1>
        <Button variant="outline" render={<Link href="/ai" />}>
          <ArrowLeft className="size-4" /> AI Studio
        </Button>
      </div>
      <ForecastClient
        options={options}
        selected={selected}
        view={view}
        canApply={user.permissions.includes("ai.apply")}
      />
    </div>
  );
}
