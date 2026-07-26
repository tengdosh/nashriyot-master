import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { listUsers } from "@/lib/services/admin-service";
import { Button } from "@/components/ui/button";
import { UsersClient, type UserRow, type RefData } from "./users-client";

export const metadata = { title: "Foydalanuvchilar" };

export default async function AdminUsersPage() {
  await requirePermission("admin.users");
  const [users, roles, entities] = await Promise.all([
    listUsers(),
    prisma.role.findMany({ select: { code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.entity.findMany({ where: { archivedAt: null }, select: { id: true, name: true }, orderBy: { code: "asc" } }),
  ]);

  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    isActive: u.isActive,
    archived: u.archived,
    roleCode: u.roles[0]?.code ?? "",
    roleName: u.roles[0]?.name ?? "—",
    entityIds: u.entities.map((e) => e.id),
    entityNames: u.entities.map((e) => e.name),
  }));

  const refs: RefData = { roles, entities };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Foydalanuvchilar</h1>
        <Button variant="outline" render={<Link href="/admin" />}>
          <ArrowLeft className="size-4" /> Administratsiya
        </Button>
      </div>
      <UsersClient rows={rows} refs={refs} />
    </div>
  );
}
