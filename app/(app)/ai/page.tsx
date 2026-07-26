import Link from "next/link";
import { LineChart, Tag, Globe, Headphones, ArrowRight } from "lucide-react";
import { requirePermission } from "@/lib/rbac";
import { aiHealth } from "@/lib/ai-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";

export const metadata = { title: "AI Studio" };

const TOOLS = [
  { href: "/ai/forecast", icon: LineChart, title: "Talab prognozi", desc: "Ansambl model, MAPE, zaxira qoidasiga qoʻllash", ready: true },
  { href: "/ai/pricing", icon: Tag, title: "Dinamik narxlash", desc: "Elastiklik, tavsiya narx, pol chizigʻi", ready: true },
  { href: "/ai/geo", icon: Globe, title: "GEO annotatsiya", desc: "Javob-birinchi, Thema/BISAC, JSON-LD", ready: false },
  { href: "/ai/audio", icon: Headphones, title: "Audio (TTS)", desc: "Boblarga boʻlish, navbat, preview", ready: false },
];

export default async function AiStudioPage() {
  await requirePermission("ai.read");
  const up = await aiHealth();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI Studio</h1>
          <p className="text-sm text-muted-foreground">
            Naqsh: tavsiya → inson tasdigʻi → amal. AI hech qachon avtomatik oʻzgartirmaydi.
          </p>
        </div>
        <StatusBadge
          status={up ? "READY" : "DOWN"}
          tone={up ? "success" : "danger"}
          label={up ? "AI xizmati ishlayapti" : "AI xizmati oʻchiq"}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {TOOLS.map((t) => (
          <Card key={t.href} className={t.ready ? "" : "opacity-60"}>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <t.icon className="size-5 text-primary" /> {t.title}
              </CardTitle>
              {!t.ready && <StatusBadge status="SOON" tone="muted" label="Keyinroq" />}
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">{t.desc}</p>
              {t.ready ? (
                <Link href={t.href} className="text-primary hover:underline" aria-label="Ochish">
                  <ArrowRight className="size-5" />
                </Link>
              ) : (
                <span className="text-xs text-muted-foreground">Claude API / TTS kaliti kerak</span>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
