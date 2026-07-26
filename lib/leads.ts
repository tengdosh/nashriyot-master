import Decimal from "decimal.js";

/**
 * Pure CRM-lead helpers (spec v2 §5.3): the staleness signal for the kanban and
 * the per-campaign funnel metrics (conversion, CAC, ROI). All pure and
 * unit-tested; the service supplies rows it read from the DB.
 */

export type Num = Decimal.Value;

export type Staleness = "OK" | "WARN" | "STALE";

export const STALE_WARN_HOURS = 24;
export const STALE_HOURS = 48;

/**
 * An OPEN lead (NEW/CONTACTED) goes yellow after 24h with no contact and red
 * after 48h. Closed leads (ORDERED/LOST) are never stale — they need no chasing.
 * `lastActivity` falls back to creation time when the lead was never contacted.
 */
export function leadStaleness(lastActivity: Date, now: Date, open: boolean): Staleness {
  if (!open) return "OK";
  const hours = (now.getTime() - lastActivity.getTime()) / 3_600_000;
  if (hours >= STALE_HOURS) return "STALE";
  if (hours >= STALE_WARN_HOURS) return "WARN";
  return "OK";
}

export type CampaignInput = {
  campaign: string;
  leads: number;
  converted: number;
  revenue: Num; // net revenue from converted orders
  cost: Num; // marketing spend for the campaign
};

export type CampaignMetrics = {
  campaign: string;
  leads: number;
  converted: number;
  conversionRate: Decimal; // converted / leads
  revenue: Decimal;
  cost: Decimal;
  cac: Decimal | null; // cost / converted (null when nothing converted)
  roi: Decimal | null; // (revenue − cost) / cost (null when no spend)
  revenuePerLead: Decimal; // revenue / leads
};

/** Funnel metrics for one campaign; every ratio guards divide-by-zero. */
export function campaignMetrics(input: CampaignInput): CampaignMetrics {
  const leads = input.leads;
  const converted = input.converted;
  const revenue = new Decimal(input.revenue);
  const cost = new Decimal(input.cost);
  return {
    campaign: input.campaign,
    leads,
    converted,
    conversionRate: leads > 0 ? new Decimal(converted).div(leads) : new Decimal(0),
    revenue,
    cost,
    cac: converted > 0 ? cost.div(converted) : null,
    roi: cost.gt(0) ? revenue.minus(cost).div(cost) : null,
    revenuePerLead: leads > 0 ? revenue.div(leads) : new Decimal(0),
  };
}

/** Roll a set of campaigns up, sorted by revenue desc, with a totals row. */
export function campaignTotals(rows: CampaignMetrics[]): {
  leads: number;
  converted: number;
  revenue: Decimal;
  cost: Decimal;
  conversionRate: Decimal;
  roi: Decimal | null;
} {
  const leads = rows.reduce((a, r) => a + r.leads, 0);
  const converted = rows.reduce((a, r) => a + r.converted, 0);
  const revenue = rows.reduce((a, r) => a.plus(r.revenue), new Decimal(0));
  const cost = rows.reduce((a, r) => a.plus(r.cost), new Decimal(0));
  return {
    leads,
    converted,
    revenue,
    cost,
    conversionRate: leads > 0 ? new Decimal(converted).div(leads) : new Decimal(0),
    roi: cost.gt(0) ? revenue.minus(cost).div(cost) : null,
  };
}
