import Link from "next/link";
import { Users, ShieldCheck, SlidersHorizontal, ScrollText, Plug, Upload, ArrowRight, RefreshCw, Database, AlertTriangle, CheckCircle2 } from "lucide-react";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";

export const metadata = { title: "Administratsiya" };

const SECTIONS = [
  { href: "/admin/users", icon: Users, perm: "admin.users", title: "Foydalanuvchilar", desc: "Taklif, rollar, sub'ekt kirishi, parol tiklash", ready: true },
  { href: "/admin/roles", icon: ShieldCheck, perm: "admin.roles", title: "Rollar va ruxsatlar", desc: "9 rol × ruxsatlar matritsasi", ready: true },
  { href: "/admin/settings", icon: SlidersHorizontal, perm: "admin.settings", title: "Sozlamalar", desc: "QQS, dead-stock, saqlash %, ROI, Z, tariflar", ready: true },
  { href: "/admin/audit", icon: ScrollText, perm: "admin.audit", title: "Audit jurnali", desc: "Barcha o'zgarishlar, before/after diff", ready: true },
  { href: "/admin/recurring-costs", icon: RefreshCw, perm: "admin.settings", title: "Takroriy xarajatlar", desc: "Oylik avtomatik CostEntry shablonlari (ijara, oylik, kommunal...)", ready: true },
  { href: "/admin/integrations", icon: Plug, perm: "admin.integrations", title: "Integratsiyalar", desc: "AI health, kalitlar, mappinglar", ready: false },
  { href: "/admin/import", icon: Upload, perm: "admin.import", title: "Import", desc: "CSV shablonlar, validatsiya, tranzaksion", ready: false },
];

async function getLastBackupAt(): Promise<Date | null> {
  const row = await prisma.setting.findUnique({ where: { key: "lastBackupAt" } });
  if (!row) return null;
  const val = row.value;
  if (typeof val === "string") return new Date(val);
  return null;
}

export default async function AdminPage() {
  const user = await requirePermission("admin.users");
  const visible = SECTIONS.filter((s) => user.permissions.includes(s.perm));

  const lastBackup = await getLastBackupAt();
  const now = Date.now();
  const backupAgeMs = lastBackup ? now - lastBackup.getTime() : Infinity;
  const backupStale = backupAgeMs > 48 * 60 * 60 * 1000;

  function fmtBackupAge() {
    if (!lastBackup) return "Hech qachon";
    const h = Math.floor(backupAgeMs / 3_600_000);
    if (h < 1) return "Bir soatdan kam";
    if (h < 24) return `${h} soat oldin`;
    const d = Math.floor(h / 24);
    return `${d} kun ${h % 24} soat oldin`;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Administratsiya</h1>
        <p className="text-sm text-muted-foreground">Tizim boshqaruvi — har bir amal audit jurnaliga yoziladi.</p>
      </div>

      {/* Backup monitoring widget */}
      <div
        className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
          !lastBackup || backupStale
            ? "border-destructive/40 bg-destructive/5 text-destructive"
            : "border-green-600/30 bg-green-50 text-green-800 dark:bg-green-950/20 dark:text-green-400"
        }`}
      >
        <Database className="size-4 shrink-0" />
        <div className="flex flex-1 items-center gap-2">
          <span className="font-medium">Oxirgi zaxira:</span>
          <span>{fmtBackupAge()}</span>
          {lastBackup && (
            <span className="text-xs opacity-70">
              ({lastBackup.toLocaleString("uz-UZ")})
            </span>
          )}
        </div>
        {!lastBackup || backupStale ? (
          <AlertTriangle className="size-4 shrink-0" />
        ) : (
          <CheckCircle2 className="size-4 shrink-0" />
        )}
        {(!lastBackup || backupStale) && (
          <span className="text-xs font-medium">
            {!lastBackup ? "Zaxira hech qachon olinmagan!" : "48 soatdan eski — yangilash kerak!"}
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((s) => (
          <Card key={s.href} className={s.ready ? "" : "opacity-60"}>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <s.icon className="size-5 text-primary" /> {s.title}
              </CardTitle>
              {!s.ready && <StatusBadge status="SOON" tone="muted" label="Keyinroq" />}
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">{s.desc}</p>
              {s.ready && (
                <Link href={s.href} className="text-primary hover:underline" aria-label="Ochish">
                  <ArrowRight className="size-5" />
                </Link>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
