import { requirePermission } from "@/lib/rbac";
import { getVisibleWidgets } from "@/lib/services/dashboard-service";
import { DashboardBoard, type BoardWidget } from "./dashboard-board";
import { renderWidget } from "./widgets";

export const metadata = { title: "Boshqaruv paneli" };

export default async function DashboardPage() {
  const user = await requirePermission("dashboard.read");

  const layout = await getVisibleWidgets(user.id, user.roles, user.permissions);

  // Render every widget on the server (each reads only views/notifications and
  // self-guards its data fetch), then hand the nodes to the client board which
  // owns ordering / width / show-hide without ever re-fetching.
  const widgets: BoardWidget[] = await Promise.all(
    layout.map(async (w) => ({
      id: w.id,
      w: w.w,
      hidden: !!w.hidden,
      title: w.title,
      node: await renderWidget(w.id, { roles: user.roles }),
    })),
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Boshqaruv paneli</h1>
        <p className="text-sm text-muted-foreground">
          Xush kelibsiz, {user.name}. Vidjetlar faqat materiallashtirilgan koʻrinishlardan oʻqiydi.
        </p>
      </div>

      {widgets.length === 0 ? (
        <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Sizning rolingiz uchun vidjet yoʻq.
        </p>
      ) : (
        <DashboardBoard widgets={widgets} />
      )}
    </div>
  );
}
