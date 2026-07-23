import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";

// Shell for all protected modules. Middleware already gates access; this also
// loads the accessible subjects for the topbar entity switcher.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user;

  const entities = user.entityAccess.length
    ? await prisma.entity.findMany({
        where: { id: { in: user.entityAccess } },
        select: { id: true, code: true, name: true },
        orderBy: { code: "asc" },
      })
    : [];

  return (
    <div className="flex min-h-screen">
      <Sidebar permissions={user.permissions} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={{ name: user.name, email: user.email }} entities={entities} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
