"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { isMeasure, isDimension } from "@/lib/analytics";
import {
  constructorQuery,
  saveReport,
  deleteSavedReport,
  type ConstructorSpec,
} from "@/lib/services/analytics-service";
import { runJob } from "@/jobs";

function parseSpec(raw: unknown): ConstructorSpec {
  const s = raw as Partial<ConstructorSpec>;
  if (!s || !isMeasure(String(s.measure)) || !isDimension(String(s.dimension))) {
    throw new Error("Notoʻgʻri hisobot parametrlari");
  }
  if (s.secondaryDimension && !isDimension(String(s.secondaryDimension))) {
    throw new Error("Notoʻgʻri ikkilamchi kesim");
  }
  if (!/^\d{4}-\d{2}$/.test(String(s.from)) || !/^\d{4}-\d{2}$/.test(String(s.to))) {
    throw new Error("Davr formati: YYYY-MM");
  }
  return {
    measure: s.measure!,
    dimension: s.dimension!,
    secondaryDimension: s.secondaryDimension ?? null,
    from: s.from!,
    to: s.to!,
  };
}

/** Run the constructor and return a plain (number) pivot for the client. */
export async function runConstructorAction(raw: unknown) {
  await requirePermission("analytics.read");
  const { spec, pivot } = await constructorQuery(parseSpec(raw));
  return {
    spec,
    columns: pivot.columns,
    rows: pivot.rows.map((r) => ({
      key: r.key,
      cells: Object.fromEntries(Object.entries(r.cells).map(([k, v]) => [k, v.toNumber()])),
      total: r.total.toNumber(),
    })),
    columnTotals: Object.fromEntries(Object.entries(pivot.columnTotals).map(([k, v]) => [k, v.toNumber()])),
    grandTotal: pivot.grandTotal.toNumber(),
  };
}

export async function saveReportAction(name: string, raw: unknown) {
  const user = await requirePermission("analytics.read");
  if (!name.trim()) throw new Error("Hisobot nomi majburiy");
  await saveReport(name.trim(), parseSpec(raw), user.id);
  revalidatePath("/analytics");
}

export async function deleteReportAction(id: string) {
  const user = await requirePermission("analytics.read");
  await deleteSavedReport(id, user.id);
  revalidatePath("/analytics");
}

/** Manual view refresh (admin) — otherwise the nightly chain handles it. */
export async function refreshViewsAction() {
  const user = await requirePermission("admin.settings");
  const res = await runJob("refresh-views", user.id);
  revalidatePath("/analytics");
  return res.result;
}
