import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/rbac";
import { listAudioTitles, audioEnabled } from "@/lib/services/audio-service";
import { Button } from "@/components/ui/button";
import { AudioClient, type AudioTitleRow } from "./audio-client";

export const metadata = { title: "Audiokitob" };

export default async function AudioPage() {
  const user = await requirePermission("ai.read");
  const titles = await listAudioTitles();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audiokitob (TTS)</h1>
          <p className="text-sm text-muted-foreground">
            Matnni boblarga boʻlib, ovozga aylantirish — faqat shartnomada AUDIO huquqi bor kitoblar uchun.
          </p>
        </div>
        <Button variant="outline" render={<Link href="/ai" />}>
          <ArrowLeft className="size-4" /> AI Studio
        </Button>
      </div>

      {!audioEnabled() && (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          TTS provayder sozlanmagan — <code>TTS_PROVIDER</code> va uning kaliti berilgach ovoz sintezi ishlaydi.
          Boblarga boʻlish va navbat baribir ishlaydi.
        </div>
      )}

      <AudioClient
        titles={titles as AudioTitleRow[]}
        canSynth={user.permissions.includes("ai.apply")}
      />
    </div>
  );
}
