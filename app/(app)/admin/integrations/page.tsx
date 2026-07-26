import Link from "next/link";
import { ArrowLeft, Bot, Database, KeyRound } from "lucide-react";
import { requirePermission } from "@/lib/rbac";
import { aiHealth } from "@/lib/ai-client";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";

export const metadata = { title: "Integratsiyalar" };

/** A key is "set" if present and not the placeholder — value itself is never shown. */
function keyStatus(v: string | undefined): boolean {
  return !!v && !/change-me|dev-|dev$/.test(v);
}

export default async function AdminIntegrationsPage() {
  await requirePermission("admin.integrations");
  const [ai, dbOk] = await Promise.all([
    aiHealth(),
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
  ]);

  const keys = [
    { name: "AUTH_SECRET", set: keyStatus(process.env.AUTH_SECRET) },
    { name: "AI_SERVICE_TOKEN", set: keyStatus(process.env.AI_SERVICE_TOKEN) },
    { name: "REPORTS_API_TOKEN", set: keyStatus(process.env.REPORTS_API_TOKEN) },
    { name: "ANTHROPIC_API_KEY (GEO — kelajakda)", set: keyStatus(process.env.ANTHROPIC_API_KEY) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Integratsiyalar</h1>
        <Button variant="outline" render={<Link href="/admin" />}>
          <ArrowLeft className="size-4" /> Administratsiya
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Bot className="size-5 text-primary" /> AI xizmati</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{process.env.AI_SERVICE_URL ?? "—"}</span>
            <StatusBadge status={ai ? "UP" : "DOWN"} tone={ai ? "success" : "danger"} label={ai ? "Ishlayapti" : "Oʻchiq"} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Database className="size-5 text-primary" /> Maʼlumotlar bazasi</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">PostgreSQL</span>
            <StatusBadge status={dbOk ? "UP" : "DOWN"} tone={dbOk ? "success" : "danger"} label={dbOk ? "Ulangan" : "Xato"} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="size-5 text-primary" /> Kalitlar</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            Kalit qiymatlari hech qachon koʻrsatilmaydi — faqat oʻrnatilgan/oʻrnatilmagani. Kalitlar server
            muhit oʻzgaruvchilarida saqlanadi.
          </p>
          {keys.map((k) => (
            <div key={k.name} className="flex items-center justify-between border-t py-1.5 text-sm">
              <span className="font-mono text-xs">{k.name}</span>
              <StatusBadge status={k.set ? "SET" : "UNSET"} tone={k.set ? "success" : "muted"} label={k.set ? "Oʻrnatilgan" : "Oʻrnatilmagan"} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
