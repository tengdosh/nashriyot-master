import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/rbac";
import { rolesWithPermissions } from "@/lib/services/admin-service";
import { Button } from "@/components/ui/button";
import { RolesMatrix } from "./roles-matrix";

export const metadata = { title: "Rollar va ruxsatlar" };

export default async function AdminRolesPage() {
  const user = await requirePermission("admin.roles");
  const { roles, modules, matrix } = await rolesWithPermissions();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Rollar va ruxsatlar</h1>
        <Button variant="outline" render={<Link href="/admin" />}>
          <ArrowLeft className="size-4" /> Administratsiya
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        9 standart rol × ruxsatlar matritsasi. DIRECTOR va ADMIN — tizim rollari, barcha ruxsatga ega va
        oʻzgartirilmaydi.
      </p>
      <RolesMatrix roles={roles} modules={modules} matrix={matrix} canWrite={user.permissions.includes("admin.roles")} />
    </div>
  );
}
