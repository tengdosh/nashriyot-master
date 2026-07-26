import Link from "next/link";
import { ArrowLeft, Upload } from "lucide-react";
import { requirePermission } from "@/lib/rbac";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Import" };

export default async function AdminImportPage() {
  await requirePermission("admin.import");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Import</h1>
        <Button variant="outline" render={<Link href="/admin" />}>
          <ArrowLeft className="size-4" /> Administratsiya
        </Button>
      </div>
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-12 text-center">
        <Upload className="size-10 text-muted-foreground" />
        <div>
          <p className="font-medium">CSV import — keyinroq</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Real fayl formatidagi CSV shablonlar, moslashtirish lugʻati, sinov rejimi (yozmasdan
            validatsiya) va tranzaksion import (spec v2 §9). Bu bosqich haqiqiy import fayllarini talab
            qiladi — keyingi rejada quriladi.
          </p>
        </div>
      </div>
    </div>
  );
}
