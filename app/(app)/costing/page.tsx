import { requirePermission } from "@/lib/rbac";
import { costingTable } from "@/lib/services/costing-service";
import { InfoHint } from "@/components/shared/info-hint";
import { CostingTable, type CostRow } from "./costing-table";
import { SnapshotButton } from "./snapshot-button";

export const metadata = { title: "Tan narx" };

export default async function CostingPage() {
  const user = await requirePermission("costing.read");
  const rows = await costingTable();

  const view: CostRow[] = rows.map((r) => ({
    productId: r.productId,
    sku: r.sku,
    workTitle: r.workTitle,
    reportCost: r.reportCost ? r.reportCost.toNumber() : null,
    decisionCost: r.decisionCost ? r.decisionCost.toNumber() : null,
    expNet: r.expNet.toNumber(),
    reportMargin: r.reportMargin ? r.reportMargin.toNumber() : null,
    hasSnapshot: r.hasSnapshot,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tan narx (jonli)</h1>
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            reportCost va decisionCost doim yonma-yon — aralashmaydi.
            <InfoHint>
              reportCost = unikal + bosma + yig&apos;ilgan doimiy (rentabellik uchun). decisionCost = bosma +
              kunlik saqlash (sunk&apos;siz — bugungi qaror va narx poli uchun). Unikal ulush faqat reportCost&apos;da,
              ikki marta sanalmaydi.
            </InfoHint>
          </p>
        </div>
        {user.permissions.includes("admin.settings") && <SnapshotButton />}
      </div>
      <CostingTable rows={view} />
    </div>
  );
}
