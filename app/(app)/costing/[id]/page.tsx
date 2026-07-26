import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/rbac";
import { costingDetail } from "@/lib/services/costing-service";
import { Button } from "@/components/ui/button";
import { CostingDetail, type DetailView } from "./costing-detail";

export const metadata = { title: "Tan narx — SKU" };

export default async function CostingSkuPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePermission("costing.read");

  let data: Awaited<ReturnType<typeof costingDetail>>;
  try {
    data = await costingDetail(id);
  } catch {
    notFound();
  }

  const view: DetailView = {
    workTitle: data.product.title.workTitle,
    sku: data.product.sku,
    history: data.history,
    layers: data.layers,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{view.workTitle}</h1>
          <p className="text-sm text-muted-foreground">{view.sku ?? "—"} · jonli tan narx tahlili</p>
        </div>
        <Button variant="outline" render={<Link href="/costing" />}>
          <ArrowLeft className="size-4" /> Tan narx
        </Button>
      </div>
      <CostingDetail view={view} />
    </div>
  );
}
