// check:entity-ok: RoyaltyRun is company-wide — one run per period covers all entities/contracts
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { requirePermission } from "@/lib/rbac";
import { getRoyaltyRun } from "@/lib/services/royalty-service";
import { Button } from "@/components/ui/button";
import { RunDetail, type StatementView } from "./run-detail";

export const metadata = { title: "Royalti hisobi" };

export default async function RoyaltyRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission("royalty.read");

  let run: Awaited<ReturnType<typeof getRoyaltyRun>>;
  try {
    run = await getRoyaltyRun(id);
  } catch {
    notFound();
  }

  const statements: StatementView[] = run.statements.map((s) => ({
    id: s.id,
    contributor: s.contract.contributor.fullName,
    contributorRole: s.contract.contributor.role,
    workTitle: s.contract.title?.workTitle ?? "—",
    unitsSold: s.unitsSold,
    returnedUnits: s.returnedUnits,
    netUnits: s.netUnits,
    cumulativeBefore: s.cumulativeBefore,
    earned: Number(s.earned),
    reserveHeld: Number(s.reserveHeld),
    reserveReleased: Number(s.reserveReleased),
    advanceRecouped: Number(s.advanceRecouped),
    advanceOutstanding: Number(s.advanceOutstanding),
    payable: Number(s.payable),
    detail: s.detail as StatementView["detail"],
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Royalti hisobi — {run.period}</h1>
          <p className="text-sm text-muted-foreground">
            {run.periodStart.toISOString().slice(0, 10)} – {run.periodEnd.toISOString().slice(0, 10)}
            {run.createdBy && ` · ${run.createdBy.fullName} hisobladi`}
            {run.approvedBy && ` · ${run.approvedBy.fullName} tasdiqladi`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" render={<Link href={`/royalties/runs/${id}/print`} target="_blank" />}>
            <Printer className="size-4" /> Chop etish
          </Button>
          <Button variant="outline" render={<Link href="/royalties/runs" />}>
            <ArrowLeft className="size-4" /> Hisoblarga
          </Button>
        </div>
      </div>

      <RunDetail
        runId={run.id}
        period={run.period}
        status={run.status}
        sealed={run.sealedAt != null}
        createdById={run.createdBy?.id ?? null}
        currentUserId={user.id!}
        statements={statements}
        canApprove={user.permissions.includes("royalty.approve")}
        canWrite={user.permissions.includes("royalty.write")}
      />
    </div>
  );
}
