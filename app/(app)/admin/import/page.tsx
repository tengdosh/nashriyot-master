import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { ImportClient } from "./import-client";

export const metadata = { title: "Import" };

export default async function AdminImportPage() {
  await requirePermission("admin.import");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Import (CSV)</h1>
        <Button variant="outline" render={<Link href="/admin" />}>
          <ArrowLeft className="size-4" /> Administratsiya
        </Button>
      </div>
      <ImportClient />
    </div>
  );
}
