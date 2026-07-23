import Link from "next/link";
import { Printer } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { ProductionBoard, type TaskRow } from "./production-board";

export const metadata = { title: "Ishlab chiqarish" };

export default async function ProductionPage() {
  const user = await requirePermission("production.read");
  const [tasks, titles] = await Promise.all([
    prisma.productionTask.findMany({
      include: {
        title: { select: { workTitle: true } },
        assignee: { select: { fullName: true } },
        dependsOn: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 300,
    }),
    prisma.title.findMany({ where: { archivedAt: null }, select: { id: true, workTitle: true }, take: 200 }),
  ]);

  const rows: TaskRow[] = tasks.map((t) => ({
    id: t.id,
    name: t.name,
    status: t.status,
    title: t.title.workTitle,
    assignee: t.assignee?.fullName ?? null,
    dependsOn: t.dependsOn?.name ?? null,
    dueDate: t.dueDate?.toISOString() ?? null,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Ishlab chiqarish</h1>
        <Button variant="outline" render={<Link href="/production/print-orders" />}>
          <Printer className="size-4" /> Print orderlar
        </Button>
      </div>
      <ProductionBoard tasks={rows} titles={titles} canWrite={user.permissions.includes("production.write")} />
    </div>
  );
}
