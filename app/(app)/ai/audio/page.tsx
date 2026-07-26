import Link from "next/link";
import { ArrowLeft, Headphones } from "lucide-react";
import { requirePermission } from "@/lib/rbac";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Audio (TTS)" };

export default async function AudioPage() {
  await requirePermission("ai.read");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Audio (TTS)</h1>
        <Button variant="outline" render={<Link href="/ai" />}>
          <ArrowLeft className="size-4" /> AI Studio
        </Button>
      </div>
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-12 text-center">
        <Headphones className="size-10 text-muted-foreground" />
        <div>
          <p className="font-medium">Audio (TTS) — keyinroq</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            boblarga boʻlish, navbat, preview va yigʻish; shartnomada AUDIO huquqi nazorati. Bu modul <strong>TTS provayder kaliti</strong>ni talab qiladi va spec joriy tartibida oxirgi bosqich
            (AI-4). Naqsh oʻzgarmaydi: tavsiya → inson tasdigʻi → amal.
          </p>
        </div>
      </div>
    </div>
  );
}
