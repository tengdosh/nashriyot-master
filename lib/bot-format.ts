import { formatUZS, formatNumber } from "@/lib/format";
import { REPORT_CATALOG, type ReportName } from "@/lib/reports-catalog";

/**
 * Pure renderers: a report's JSON payload → an Uzbek Telegram message. No
 * grammY, no I/O — 100% unit-tested. Every message ends with a source line so
 * the reader knows the numbers came from the platform (spec §5.2).
 */

const money = (v: number) => formatUZS(v);

const PERIOD_LABEL: Record<string, string> = {
  "7d": "so'nggi 7 kun",
  "30d": "so'nggi 30 kun",
  month: "shu oy",
  quarter: "shu chorak",
  year: "shu yil",
};

function source(name: ReportName, generatedAt?: string): string {
  const d = generatedAt ? new Date(generatedAt) : new Date();
  const stamp = `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
  return `\n\n📄 Manba: ${REPORT_CATALOG[name].menuLabel} · ${stamp}`;
}

// ── per-report renderers ────────────────────────────────────────────────────────

type Any = Record<string, unknown>;
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const n = (v: unknown): number => (typeof v === "number" ? v : 0);
const s = (v: unknown): string => (typeof v === "string" ? v : "");

function salesSummary(d: Any): string {
  const channels = arr<{ name: string; net: number }>(d.channels)
    .map((c) => `  • ${c.name}: ${money(c.net)}`)
    .join("\n");
  const top = arr<{ workTitle: string; net: number }>(d.top5)
    .map((t, i) => `  ${i + 1}. ${t.workTitle} — ${money(t.net)}`)
    .join("\n");
  return [
    `📊 *Sotuv xulosasi* (${PERIOD_LABEL[s(d.period)] ?? s(d.period)})`,
    `Sof tushum: ${money(n(d.net))}`,
    `Sotilgan nusxa: ${formatNumber(n(d.units))}`,
    `Kontributsion marja (CM): ${money(n(d.cm))}`,
    `Buyurtmalar: ${formatNumber(n(d.orderCount))}`,
    channels ? `\nKanallar:\n${channels}` : "",
    top ? `\nTop-5 kitob:\n${top}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function inventoryStatus(d: Any): string {
  const rop = arr<{ workTitle: string; available: number; suggestQty: number }>(d.rop)
    .map((r) => `  • ${r.workTitle}: qoldiq ${formatNumber(r.available)}, buyurtma ~${formatNumber(r.suggestQty)}`)
    .join("\n");
  return [
    `📦 *Ombor holati*`,
    `Umumiy zaxira qiymati: ${money(n(d.totalValue))}`,
    `SKU soni: ${formatNumber(n(d.skuCount))}`,
    n(d.ropCount) > 0 ? `\n⚠️ ROP dan past (${formatNumber(n(d.ropCount))}):\n${rop}` : `\n✅ Hamma zaxira ROP dan yuqori.`,
  ].join("\n");
}

function deadStock(d: Any): string {
  const top = arr<{ workTitle: string; qtyOnHand: number; totalLoss: number }>(d.top10)
    .map((f) => `  • ${f.workTitle}: ${formatNumber(f.qtyOnHand)} dona, zarar ${money(f.totalLoss)}`)
    .join("\n");
  return [
    `🧊 *O'lik zaxira*`,
    `Muzlagan kapital: ${money(n(d.frozenCapital))}`,
    `Nusxalar: ${formatNumber(n(d.copies))}, belgilar: ${formatNumber(n(d.flagCount))}`,
    top ? `\nEng katta zarar:\n${top}` : `\n✅ O'lik zaxira yo'q.`,
  ].join("\n");
}

function royaltyLiability(d: Any): string {
  const pending = arr<{ period: string; liability: number; createdBy: string | null }>(d.pendingApproval)
    .map((r) => `  • ${r.period}: ${money(r.liability)}${r.createdBy ? ` (${r.createdBy})` : ""}`)
    .join("\n");
  return [
    `👑 *Mualliflik haqi majburiyati*`,
    d.latestPeriod ? `So'nggi davr: ${s(d.latestPeriod)} (${s(d.latestStatus)})` : `Hali hisob-kitob yo'q`,
    `Joriy majburiyat: ${money(n(d.latestLiability))}`,
    n(d.pendingApprovalCount) > 0 ? `\n⏳ Tasdiq kutmoqda (${formatNumber(n(d.pendingApprovalCount))}):\n${pending}` : `\n✅ Tasdiq kutayotgan run yo'q.`,
  ].join("\n");
}

function arAging(d: Any): string {
  const b = (d.buckets ?? {}) as Any;
  const over = arr<{ partner: string; outstanding: number }>(d.overLimit)
    .map((c) => `  • ${c.partner}: ${money(c.outstanding)}`)
    .join("\n");
  return [
    `💳 *Debitorlik (AR) aging*`,
    `Jami: ${money(n(d.total))}, muddati o'tgan: ${money(n(d.overdue))}`,
    `  0-30: ${money(n(b.D0_30))}`,
    `  31-60: ${money(n(b.D31_60))}`,
    `  61-90: ${money(n(b.D61_90))}`,
    `  90+: ${money(n(b.D90_PLUS))}`,
    n(d.overLimitCount) > 0 ? `\n🚩 Limitdan oshgan (${formatNumber(n(d.overLimitCount))}):\n${over}` : `\n✅ Limitdan oshgan hamkor yo'q.`,
  ].join("\n");
}

const TOP_METRIC_LABEL: Record<string, string> = { revenue: "tushum", units: "nusxa", cm: "CM" };

function topTitles(d: Any): string {
  const metric = s(d.metric);
  const rows = arr<{ workTitle: string; revenue: number; units: number; cm: number }>(d.rows)
    .map((r, i) => {
      const val = metric === "units" ? formatNumber(r.units) : money(metric === "cm" ? r.cm : r.revenue);
      return `  ${i + 1}. ${r.workTitle} — ${val}`;
    })
    .join("\n");
  return [`🏆 *Top kitoblar* (${TOP_METRIC_LABEL[metric] ?? metric})`, rows || "  (ma'lumot yo'q)"].join("\n");
}

function kpiDigest(d: Any): string {
  const alerts = arr<{ type: string; count: number }>(d.alertsByType)
    .map((a) => `  • ${a.type}: ${formatNumber(a.count)}`)
    .join("\n");
  return [
    `📈 *KPI daydjest*`,
    `Kassa: ${money(n(d.cash))}`,
    `Debitorlik (AR): ${money(n(d.ar))} · Kreditorlik (AP): ${money(n(d.ap))}`,
    `Ombor qiymati: ${money(n(d.inventoryValue))} · ROP: ${formatNumber(n(d.ropCount))}`,
    `Muzlagan kapital: ${money(n(d.frozenCapital))}`,
    `Ochiq ogohlantirishlar: ${formatNumber(n(d.openAlerts))}`,
    alerts ? alerts : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function costingRisk(d: Any): string {
  const rows = arr<{ workTitle: string; daysUntilCross: number | null }>(d.atRisk)
    .map((r) => `  • ${r.workTitle}: ${r.daysUntilCross != null ? `${formatNumber(r.daysUntilCross)} kun` : "—"}`)
    .join("\n");
  return [
    `🔥 *Tan narx xavfi*`,
    `Tekshirilgan: ${formatNumber(n(d.scanned))}`,
    n(d.atRiskCount) > 0 ? `\n⚠️ Qaytmas nuqtaga <30 kun (${formatNumber(n(d.atRiskCount))}):\n${rows}` : `\n✅ Yaqin xavf yo'q.`,
  ].join("\n");
}

function agentsKpi(d: Any): string {
  const rows = arr<{ partner: string; salesNet: number; dso: number; returnRatePct: number }>(d.agents)
    .map((a) => `  • ${a.partner}: sotuv ${money(a.salesNet)}, DSO ${formatNumber(a.dso)} kun, qaytish ${a.returnRatePct}%`)
    .join("\n");
  return [`🤝 *Agent KPI*`, rows || "  (agent yo'q)"].join("\n");
}

const RENDERERS: Record<ReportName, (d: Any) => string> = {
  "sales-summary": salesSummary,
  "inventory-status": inventoryStatus,
  "dead-stock": deadStock,
  "royalty-liability": royaltyLiability,
  "ar-aging": arAging,
  "top-titles": topTitles,
  "kpi-digest": kpiDigest,
  "costing-risk": costingRisk,
  "agents-kpi": agentsKpi,
};

/** Render a report payload into a source-stamped Uzbek message. */
export function renderReport(name: ReportName, data: unknown, generatedAt?: string): string {
  const body = RENDERERS[name](data as Any);
  return body + source(name, generatedAt);
}
