import { z } from "zod";

/**
 * Whitelisted report catalog (spec §5, playbook "Hisobot API katalogi").
 *
 * This is the ONLY surface the bot — and Claude tool-use behind it — may reach.
 * Pure and client-safe: no DB, no server-only imports, so both the API route
 * and the bot import it, and it is 100% unit-tested. The actual data lives in
 * lib/services/reports-service.ts; this file only declares names, permissions,
 * parameters and menu presentation.
 */

export const REPORT_NAMES = [
  "sales-summary",
  "inventory-status",
  "dead-stock",
  "royalty-liability",
  "ar-aging",
  "top-titles",
  "kpi-digest",
  "costing-risk",
  "agents-kpi",
] as const;

export type ReportName = (typeof REPORT_NAMES)[number];

export const salesPeriodSchema = z.enum(["7d", "30d", "month", "quarter", "year"]);
export type SalesPeriod = z.infer<typeof salesPeriodSchema>;

export const topMetricSchema = z.enum(["revenue", "units", "cm"]);
export type TopMetric = z.infer<typeof topMetricSchema>;

const noParams = z.object({}).strict();

export const REPORT_PARAM_SCHEMAS = {
  "sales-summary": z
    .object({
      period: salesPeriodSchema.default("30d"),
      channelId: z.string().min(1).optional(),
      entityId: z.string().min(1).optional(),
    })
    .strict(),
  "inventory-status": z.object({ entityId: z.string().min(1).optional() }).strict(),
  "dead-stock": noParams,
  "royalty-liability": noParams,
  "ar-aging": noParams,
  "top-titles": z
    .object({ metric: topMetricSchema.default("revenue"), n: z.number().int().min(1).max(20).default(5) })
    .strict(),
  "kpi-digest": noParams,
  "costing-risk": noParams,
  "agents-kpi": noParams,
} as const satisfies Record<ReportName, z.ZodTypeAny>;

export type ReportDef = {
  name: ReportName;
  /** Specific permission that gates this report's menu button and execution. */
  permission: string;
  /** Telegram menu button label (Uzbek) + leading emoji. */
  menuLabel: string;
  menuIcon: string;
  /** One-line description Claude sees when choosing a tool. */
  description: string;
  /** JSON Schema of the parameters, for Claude tool-use `input_schema`. */
  inputSchema: Record<string, unknown>;
};

const obj = (props: Record<string, unknown>, required: string[] = []) => ({
  type: "object" as const,
  properties: props,
  required,
  additionalProperties: false,
});

export const REPORT_CATALOG: Record<ReportName, ReportDef> = {
  "sales-summary": {
    name: "sales-summary",
    permission: "sales.read",
    menuLabel: "Sotuv",
    menuIcon: "📊",
    description:
      "Davr bo'yicha sotuv xulosasi: jami sof tushum, sotilgan nusxa, kontributsion marja (CM), kanal taqsimoti va top-5 kitob.",
    inputSchema: obj({
      period: { type: "string", enum: [...salesPeriodSchema.options], description: "Davr: 7d, 30d, month, quarter, year" },
      channelId: { type: "string", description: "Ixtiyoriy kanal filtri" },
      entityId: { type: "string", description: "Ixtiyoriy sub'ekt filtri" },
    }),
  },
  "inventory-status": {
    name: "inventory-status",
    permission: "inventory.read",
    menuLabel: "Ombor",
    menuIcon: "📦",
    description: "Ombor holati: umumiy zaxira qiymati va qayta buyurtma nuqtasidan (ROP) pastga tushgan kitoblar ro'yxati.",
    inputSchema: obj({ entityId: { type: "string", description: "Ixtiyoriy sub'ekt filtri" } }),
  },
  "dead-stock": {
    name: "dead-stock",
    permission: "inventory.read",
    menuLabel: "Dead-stock",
    menuIcon: "🧊",
    description: "O'lik zaxira: muzlagan kapital va eng katta zarar keltiruvchi top-10 kitob.",
    inputSchema: obj({}),
  },
  "royalty-liability": {
    name: "royalty-liability",
    permission: "royalty.read",
    menuLabel: "Royalti",
    menuIcon: "👑",
    description: "Mualliflik haqi majburiyati: joriy davr majburiyati va tasdiq kutayotgan hisob-kitob (run) lar.",
    inputSchema: obj({}),
  },
  "ar-aging": {
    name: "ar-aging",
    permission: "finance.read",
    menuLabel: "Qarzlar",
    menuIcon: "💳",
    description: "Debitorlik qarzlari aging (0-30/31-60/61-90/90+) va kredit limitidan oshgan hamkorlar.",
    inputSchema: obj({}),
  },
  "top-titles": {
    name: "top-titles",
    permission: "analytics.read",
    menuLabel: "Top kitoblar",
    menuIcon: "🏆",
    description: "Kitoblar reytingi: tushum, nusxa yoki CM o'lchovi bo'yicha eng yaxshi N ta.",
    inputSchema: obj({
      metric: { type: "string", enum: [...topMetricSchema.options], description: "O'lchov: revenue, units, cm" },
      n: { type: "integer", minimum: 1, maximum: 20, description: "Nechta (default 5)" },
    }),
  },
  "kpi-digest": {
    name: "kpi-digest",
    permission: "reports.read",
    menuLabel: "KPI",
    menuIcon: "📈",
    description: "Kunlik KPI daydjesti: asosiy ko'rsatkichlar bir joyda (sotuv, qarz, ombor, ogohlantirishlar).",
    inputSchema: obj({}),
  },
  "costing-risk": {
    name: "costing-risk",
    permission: "costing.read",
    menuLabel: "Tan narx xavfi",
    menuIcon: "🔥",
    description: "Tan narx xavfi: qaytmas nuqtaga (break-even) 30 kundan kam qolgan kitoblar va kesishish sanalari.",
    inputSchema: obj({}),
  },
  "agents-kpi": {
    name: "agents-kpi",
    permission: "finance.read",
    menuLabel: "Agentlar",
    menuIcon: "🤝",
    description: "Agent KPI: sotuv, yig'ilgan pul, DSO, qaytarish foizi va zaxira yoshi.",
    inputSchema: obj({}),
  },
};

export function isReportName(x: string): x is ReportName {
  return (REPORT_NAMES as readonly string[]).includes(x);
}

/** Menu buttons the linked user may see, filtered by their permissions. */
export function menuForPermissions(permissions: string[]): ReportDef[] {
  const set = new Set(permissions);
  // reports.read is the base gate for using the bot at all.
  if (!set.has("reports.read")) return [];
  return REPORT_NAMES.map((n) => REPORT_CATALOG[n]).filter((d) => set.has(d.permission));
}

/** Does the user have both the base gate and this report's specific permission? */
export function canRunReport(name: ReportName, permissions: string[]): boolean {
  const set = new Set(permissions);
  return set.has("reports.read") && set.has(REPORT_CATALOG[name].permission);
}

/** Claude tool-use tool definitions for the reports the user is allowed to run. */
export function claudeTools(permissions: string[]) {
  return menuForPermissions(permissions).map((d) => ({
    name: d.name,
    description: d.description,
    input_schema: d.inputSchema,
  }));
}

/**
 * Split a long message into Telegram-safe chunks (limit 4096). Breaks on the
 * last newline before the limit when possible, else hard-splits.
 */
export function splitMessage(text: string, limit = 4096): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n", limit);
    if (cut <= 0) cut = limit;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, "");
  }
  if (rest.length > 0) chunks.push(rest);
  return chunks;
}
