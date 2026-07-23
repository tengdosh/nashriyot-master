import { requirePermission } from "@/lib/rbac";
import { signOut } from "@/auth";

// Minimal protected page proving login + requirePermission. The real dashboard
// (widgets, layout) is built in Task 4 / M1.
export default async function DashboardPage() {
  const user = await requirePermission("dashboard.read");

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Boshqaruv paneli</h1>
      <p className="mt-1 text-muted-foreground">Xush kelibsiz, {user.name}</p>

      <dl className="mt-6 grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2 rounded-lg border p-4 text-sm">
        <dt className="text-muted-foreground">Email</dt>
        <dd>{user.email}</dd>
        <dt className="text-muted-foreground">Rollar</dt>
        <dd>{user.roles.join(", ") || "—"}</dd>
        <dt className="text-muted-foreground">Subʼektlar</dt>
        <dd>{user.entityAccess.join(", ") || "—"}</dd>
        <dt className="text-muted-foreground">Ruxsatlar</dt>
        <dd>{user.permissions.length} ta</dd>
      </dl>

      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
        className="mt-6"
      >
        <button className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
          Chiqish
        </button>
      </form>
    </main>
  );
}
