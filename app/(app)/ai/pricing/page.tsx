import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { pendingRecommendations } from "@/lib/services/pricing-service";
import { Button } from "@/components/ui/button";
import { PricingClient, type ProductOption, type RecView } from "./pricing-client";

export const metadata = { title: "Dinamik narxlash" };

export default async function PricingPage() {
  const user = await requirePermission("ai.read");

  const [products, recs] = await Promise.all([
    prisma.product.findMany({
      where: { archivedAt: null },
      select: { id: true, sku: true, listPrice: true, title: { select: { workTitle: true } } },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    pendingRecommendations(),
  ]);

  const options: ProductOption[] = products.map((p) => ({
    id: p.id,
    sku: p.sku,
    workTitle: p.title.workTitle,
    listPrice: Number(p.listPrice),
  }));

  const recViews: RecView[] = recs.map((r) => ({
    id: r.id,
    workTitle: r.product.title.workTitle,
    sku: r.product.sku,
    currentPrice: Number(r.currentPrice),
    suggestedPrice: Number(r.suggestedPrice),
    floorPrice: Number(r.floorPrice),
    rationale: r.rationale,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Dinamik narxlash</h1>
        <Button variant="outline" render={<Link href="/ai" />}>
          <ArrowLeft className="size-4" /> AI Studio
        </Button>
      </div>
      <PricingClient
        options={options}
        recommendations={recViews}
        canApply={user.permissions.includes("ai.apply")}
      />
    </div>
  );
}
