import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runWithAudit } from "@/lib/audit-context";
import { predict } from "@/lib/ai-client";
import { forecastConfidence, forecastDemandTotal } from "@/lib/pricing";

/**
 * Forecast service (spec v1 §5.10 / §6.6). Sends monthly history from
 * mv_monthly_sales to the AI service, persists the returned forecast, and gates
 * "apply to reorder" behind the MAPE confidence check — never auto-applies a
 * low-confidence forecast (§7.1). Pattern: recommend → human approves → act.
 */

export class ForecastError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForecastError";
  }
}

/** Trailing monthly units for a product from the materialized view, oldest first. */
export async function monthlyHistory(productId: string, months = 24): Promise<{ month: string; units: number }[]> {
  const rows = await prisma.$queryRaw<{ month: string; units: number }[]>`
    SELECT month, units FROM mv_monthly_sales WHERE "productId" = ${productId} ORDER BY month ASC
  `;
  return rows.slice(-months);
}

/**
 * Build and persist a forecast. Returns null if the AI service is unavailable
 * (graceful degradation) so the caller can show "AI unavailable".
 */
export async function buildForecast(productId: string, userId: string, horizon = 6) {
  const history = await monthlyHistory(productId);
  const series = history.map((h) => h.units);
  if (series.length < 18) {
    throw new ForecastError(
      `Kamida 18 oylik tarix kerak (hozir ${series.length}). Cold-start ustasidan foydalaning.`,
    );
  }

  const result = await predict(series, horizon);
  if (!result) return null; // AI service down → degrade

  return runWithAudit({ userId }, async () =>
    prisma.forecast.create({
      data: {
        productId,
        method: "ENSEMBLE",
        horizonMonths: horizon,
        values: result.values.map((v, i) => ({ month: nextMonths(history, i), value: v })) as unknown as Prisma.InputJsonValue,
        low: result.low as unknown as Prisma.InputJsonValue,
        high: result.high as unknown as Prisma.InputJsonValue,
        mape: result.mape != null ? new Prisma.Decimal(result.mape) : null,
      },
    }),
  );
}

/** Label the forecast months as the N months after the last history month. */
function nextMonths(history: { month: string }[], offset: number): string {
  const last = history[history.length - 1]?.month;
  if (!last) return `+${offset + 1}`;
  const [y, m] = last.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + offset + 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Apply a forecast to the product's reorder rule (§5.10 "Zaxira qoidasiga
 * qoʻllash"). BLOCKED when MAPE confidence is LOW — a low-confidence forecast
 * must never silently drive reordering. Requires ai.apply at the action layer.
 */
export async function applyForecastToReorder(forecastId: string, userId: string) {
  const f = await prisma.forecast.findUniqueOrThrow({ where: { id: forecastId } });
  const conf = forecastConfidence(f.mape != null ? Number(f.mape) : null);
  if (!conf.canAutoApply) {
    throw new ForecastError(
      `Past ishonch (MAPE ${f.mape != null ? (Number(f.mape) * 100).toFixed(0) + "%" : "nomaʼlum"}) — qoʻllash taqiqlangan`,
    );
  }

  const values = (f.values as { month: string; value: number }[] | null) ?? [];
  const total = forecastDemandTotal(values.map((v) => v.value));
  // Horizon demand → a daily average → a lead-time-based ROP hint (manualROP).
  const dailyAvg = total / (f.horizonMonths * 30);

  return runWithAudit({ userId }, async () => {
    const rule = await prisma.reorderRule.findUnique({ where: { productId: f.productId } });
    const leadTimeDays = rule?.leadTimeDays ?? 30;
    const manualROP = Math.ceil(dailyAvg * leadTimeDays);
    return prisma.reorderRule.upsert({
      where: { productId: f.productId },
      update: { manualROP, isAuto: false },
      create: { productId: f.productId, leadTimeDays, manualROP, isAuto: false },
    });
  });
}

export async function latestForecast(productId: string) {
  return prisma.forecast.findFirst({ where: { productId }, orderBy: { createdAt: "desc" } });
}
