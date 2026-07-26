import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/rbac";
import { listGeoTitles, geoEnabled } from "@/lib/services/geo-service";
import { Button } from "@/components/ui/button";
import { GeoClient, type GeoTitleRow } from "./geo-client";

export const metadata = { title: "GEO annotatsiya" };

export default async function GeoPage() {
  const user = await requirePermission("ai.read");
  const titles = await listGeoTitles();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">GEO annotatsiya</h1>
          <p className="text-sm text-muted-foreground">
            Claude qidiruv/GEO metama&apos;lumot va schema.org JSON-LD tavsiya qiladi — inson tasdiqlaydi.
          </p>
        </div>
        <Button variant="outline" render={<Link href="/ai" />}>
          <ArrowLeft className="size-4" /> AI Studio
        </Button>
      </div>

      {!geoEnabled() && (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          AI hozircha oʻchirilgan — <code>ANTHROPIC_API_KEY</code> sozlangach tavsiya generatsiyasi ishlaydi.
          Katalog va tasdiqlangan annotatsiyalar baribir koʻrinadi.
        </div>
      )}

      <GeoClient
        titles={titles as GeoTitleRow[]}
        canApply={user.permissions.includes("ai.apply")}
        enabled={geoEnabled()}
      />
    </div>
  );
}
