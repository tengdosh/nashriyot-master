import { requirePermission } from "@/lib/rbac";
import { KpiCardSkeleton } from "@/components/shared/kpi-card";

// Placeholder dashboard (spec Task 4 §4): 3 KpiCard skeletons inside the shell.
// The real widget board is built in Task 17 (M1).
export default async function DashboardPage() {
  const user = await requirePermission("dashboard.read");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Boshqaruv paneli</h1>
        <p className="text-muted-foreground">
          Xush kelibsiz, {user.name}. Toʻliq vidjetlar M1 (17-bosqich) da quriladi.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCardSkeleton />
        <KpiCardSkeleton />
        <KpiCardSkeleton />
      </div>
    </div>
  );
}
