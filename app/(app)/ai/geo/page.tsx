import Link from "next/link";
import { ArrowLeft, Globe } from "lucide-react";
import { requirePermission } from "@/lib/rbac";
import { Button } from "@/components/ui/button";

export const metadata = { title: "GEO annotatsiya" };

export default async function GeoPage() {
  await requirePermission("ai.read");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">GEO annotatsiya</h1>
        <Button variant="outline" render={<Link href="/ai" />}>
          <ArrowLeft className="size-4" /> AI Studio
        </Button>
      </div>
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-12 text-center">
        <Globe className="size-10 text-muted-foreground" />
        <div>
          <p className="font-medium">GEO annotatsiya — keyinroq</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            javob-birinchi annotatsiya (3 uzunlik), Thema/BISAC ishonch % bilan va schema.org JSON-LD. Bu modul <strong>Claude API kaliti</strong>ni talab qiladi va spec joriy tartibida oxirgi bosqich
            (AI-4). Naqsh oʻzgarmaydi: tavsiya → inson tasdigʻi → amal.
          </p>
        </div>
      </div>
    </div>
  );
}
