import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/rbac";
import { getAdminSettings } from "@/lib/services/admin-service";
import { Button } from "@/components/ui/button";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Sozlamalar" };

export default async function AdminSettingsPage() {
  await requirePermission("admin.settings");
  const settings = await getAdminSettings();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Sozlamalar</h1>
        <Button variant="outline" render={<Link href="/admin" />}>
          <ArrowLeft className="size-4" /> Administratsiya
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Bu qiymatlar butun tizim boʻylab ishlatiladi (dead-stock skaneri, ROP, narx poli). Oʻzgartirish
        keyingi hisob-kitoblardan kuchga kiradi; muhrlangan hujjatlar oʻzgarmaydi.
      </p>
      <SettingsForm settings={settings} />
    </div>
  );
}
