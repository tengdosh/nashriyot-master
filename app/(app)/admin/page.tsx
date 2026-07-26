import Link from "next/link";
import { Users, ShieldCheck, SlidersHorizontal, ScrollText, Plug, Upload, ArrowRight } from "lucide-react";
import { requirePermission } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";

export const metadata = { title: "Administratsiya" };

const SECTIONS = [
  { href: "/admin/users", icon: Users, perm: "admin.users", title: "Foydalanuvchilar", desc: "Taklif, rollar, sub'ekt kirishi, parol tiklash", ready: true },
  { href: "/admin/roles", icon: ShieldCheck, perm: "admin.roles", title: "Rollar va ruxsatlar", desc: "9 rol × ruxsatlar matritsasi", ready: true },
  { href: "/admin/settings", icon: SlidersHorizontal, perm: "admin.settings", title: "Sozlamalar", desc: "QQS, dead-stock, saqlash %, ROI, Z, tariflar", ready: true },
  { href: "/admin/audit", icon: ScrollText, perm: "admin.audit", title: "Audit jurnali", desc: "Barcha o'zgarishlar, before/after diff", ready: true },
  { href: "/admin/integrations", icon: Plug, perm: "admin.integrations", title: "Integratsiyalar", desc: "AI health, kalitlar, mappinglar", ready: false },
  { href: "/admin/import", icon: Upload, perm: "admin.import", title: "Import", desc: "CSV shablonlar, validatsiya, tranzaksion", ready: false },
];

export default async function AdminPage() {
  const user = await requirePermission("admin.users");
  const visible = SECTIONS.filter((s) => user.permissions.includes(s.perm));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Administratsiya</h1>
        <p className="text-sm text-muted-foreground">Tizim boshqaruvi — har bir amal audit jurnaliga yoziladi.</p>
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
