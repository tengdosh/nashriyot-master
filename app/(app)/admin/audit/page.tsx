import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/rbac";
import { listAuditLog, auditEntities } from "@/lib/services/admin-service";
import { Button } from "@/components/ui/button";
import { AuditClient, type AuditRow } from "./audit-client";

export const metadata = { title: "Audit jurnali" };

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<{ entity?: string }> }) {
  await requirePermission("admin.audit");
  const { entity } = await searchParams;

  const [log, entities] = await Promise.all([
    listAuditLog({ entity: entity || undefined, take: 200 }),
    auditEntities(),
  ]);

  const rows: AuditRow[] = log.map((r) => ({
    id: r.id,
    entity: r.entity,
    entityId: r.entityId,
    action: r.action,
    actor: r.actor,
    createdAt: r.createdAt.toISOString(),
    summary: r.summary,
    changes: r.changes.map((c) => ({ field: c.field, from: fmt(c.from), to: fmt(c.to) })),
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Audit jurnali</h1>
        <Button variant="outline" render={<Link href="/admin" />}>
          <ArrowLeft className="size-4" /> Administratsiya
        </Button>
      </div>
      <AuditClient rows={rows} entities={entities} selected={entity ?? ""} />
    </div>
  );
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
