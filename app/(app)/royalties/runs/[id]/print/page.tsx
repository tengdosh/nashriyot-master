/**
 * Print-ready royalty statement — no nav, clean layout, @media print CSS.
 * Route: /royalties/runs/[id]/print
 * Accessible via button on the run detail page.
 */
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/rbac";
import { getRoyaltyRun } from "@/lib/services/royalty-service";
import { formatUZS } from "@/lib/format";
import { PrintButton } from "./print-button";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Royalti hisobi #${id.slice(-6)}` };
}

function fmt(v: number) {
  return formatUZS(v);
}

export default async function RoyaltyPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePermission("royalty.read");

  let run: Awaited<ReturnType<typeof getRoyaltyRun>>;
  try {
    run = await getRoyaltyRun(id);
  } catch {
    notFound();
  }

  const totalEarned = run.statements.reduce((a, s) => a + Number(s.earned), 0);
  const totalPayable = run.statements.reduce((a, s) => a + Number(s.payable), 0);
  const totalReserve = run.statements.reduce((a, s) => a + Number(s.reserveHeld), 0);
  const periodStr = `${run.periodStart.toISOString().slice(0, 10)} – ${run.periodEnd.toISOString().slice(0, 10)}`;

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { font-size: 11pt; }
          .page-break { page-break-before: always; }
        }
        body { font-family: system-ui, sans-serif; color: #111; background: #fff; }
      `}</style>

      {/* Print/Back controls — hidden in print */}
      <div className="no-print flex items-center gap-3 border-b px-6 py-3 print:hidden">
        <a href={`/royalties/runs/${run.id}`} className="text-sm text-blue-600 hover:underline">
          ← Hisob sahifasiga
        </a>
        <PrintButton />
      </div>

      <div className="mx-auto max-w-4xl p-8">
        {/* Header */}
        <div className="mb-8 border-b-2 border-black pb-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold">ROYALTI HISOBI</h1>
              <p className="text-lg font-semibold">{run.period}</p>
              <p className="text-sm text-gray-600">{periodStr}</p>
            </div>
            <div className="text-right text-sm text-gray-600">
              <p>Sana: {new Date().toLocaleDateString("uz-UZ")}</p>
              {run.createdBy && <p>Hisobladi: {run.createdBy.fullName}</p>}
              {run.approvedBy && <p>Tasdiqladi: {run.approvedBy.fullName}</p>}
              <p className="mt-1 font-medium">
                Holat:{" "}
                <span
                  className={
                    run.status === "SENT"
                      ? "text-green-700"
                      : run.status === "APPROVED"
                        ? "text-blue-700"
                        : "text-gray-700"
                  }
                >
                  {run.status}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="mb-8 grid grid-cols-3 gap-4 rounded-lg border bg-gray-50 p-4">
          <div className="text-center">
            <p className="text-sm text-gray-500">Jami hisoblandi</p>
            <p className="text-xl font-bold">{fmt(totalEarned)}</p>
          </div>
          <div className="text-center border-x">
            <p className="text-sm text-gray-500">Zaxira (to'planib)</p>
            <p className="text-xl font-bold">{fmt(totalReserve)}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-500">To'lanishi lozim</p>
            <p className="text-xl font-bold text-green-700">{fmt(totalPayable)}</p>
          </div>
        </div>

        {/* Statements table */}
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-black bg-gray-100">
              <th className="py-2 text-left font-semibold">Muallif</th>
              <th className="py-2 text-left font-semibold">Asar</th>
              <th className="py-2 text-right font-semibold">Net nusxa</th>
              <th className="py-2 text-right font-semibold">Hisoblandi</th>
              <th className="py-2 text-right font-semibold">Avans</th>
              <th className="py-2 text-right font-semibold">Zaxira</th>
              <th className="py-2 text-right font-semibold">To'lanadi</th>
            </tr>
          </thead>
          <tbody>
            {run.statements.map((s, i) => (
              <tr key={s.id} className={i % 2 === 0 ? "" : "bg-gray-50"}>
                <td className="border-b py-2 font-medium">{s.contract.contributor.fullName}</td>
                <td className="border-b py-2 text-gray-700">
                  {s.contract.title?.workTitle ?? "—"}
                </td>
                <td className="border-b py-2 text-right tabular-nums">{s.netUnits}</td>
                <td className="border-b py-2 text-right tabular-nums">{fmt(Number(s.earned))}</td>
                <td className="border-b py-2 text-right tabular-nums">
                  {Number(s.advanceRecouped) > 0 ? fmt(Number(s.advanceRecouped)) : "—"}
                </td>
                <td className="border-b py-2 text-right tabular-nums">
                  {Number(s.reserveHeld) > 0 ? fmt(Number(s.reserveHeld)) : "—"}
                </td>
                <td className="border-b py-2 text-right tabular-nums font-semibold">
                  {fmt(Number(s.payable))}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-black font-bold">
              <td colSpan={3} className="py-2">
                JAMI
              </td>
              <td className="py-2 text-right tabular-nums">{fmt(totalEarned)}</td>
              <td className="py-2 text-right tabular-nums">—</td>
              <td className="py-2 text-right tabular-nums">{fmt(totalReserve)}</td>
              <td className="py-2 text-right tabular-nums text-green-700">{fmt(totalPayable)}</td>
            </tr>
          </tfoot>
        </table>

        {/* Per-statement detail (tier breakdown) */}
        {run.statements.some((s) => s.detail) && (
          <div className="mt-10">
            <h2 className="mb-4 text-lg font-bold">Tier tafsilotlari</h2>
            {run.statements.map((s) => {
              const detail = s.detail as
                | { tier: number; units: number; rate: number; amount: number }[]
                | null;
              if (!detail?.length) return null;
              return (
                <div key={s.id} className="mb-6">
                  <h3 className="mb-2 font-semibold">
                    {s.contract.contributor.fullName} — {s.contract.title?.workTitle ?? "—"}
                  </h3>
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="py-1 text-left">Tier</th>
                        <th className="py-1 text-right">Nusxa</th>
                        <th className="py-1 text-right">Stavka</th>
                        <th className="py-1 text-right">Summa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.map((row, ri) => (
                        <tr key={ri} className="border-b">
                          <td className="py-1">{row.tier}</td>
                          <td className="py-1 text-right tabular-nums">{row.units}</td>
                          <td className="py-1 text-right tabular-nums">
                            {(row.rate * 100).toFixed(1)}%
                          </td>
                          <td className="py-1 text-right tabular-nums">{fmt(row.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 border-t pt-4 text-xs text-gray-500">
          <p>
            Bu hujjat Nashriyot-Master tizimi tomonidan avtomatik yaratilgan.{" "}
            {run.sealedAt && `Muhr bosildi: ${run.sealedAt.toISOString().slice(0, 10)}.`}
          </p>
        </div>
      </div>
    </>
  );
}
