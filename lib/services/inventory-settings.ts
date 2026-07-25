import { prisma } from "@/lib/db";
import type { AgeDiscountTier } from "@/lib/inventory-analytics";

/**
 * Inventory knobs from the `settings` table (seeded in prisma/seed.ts). The
 * dead-stock scanner SEALS these onto every flag it writes, so changing a rate
 * later never silently rewrites yesterday's loss figures.
 */
export type InventorySettings = {
  deadStockDays: number;
  carryingRate: number;
  expectedROI: number;
  serviceLevelZ: number;
  dailyDemandWindowDays: number;
  orderCost: number;
  minTurnover: number;
  ageDiscountTiers: AgeDiscountTier[];
};

export const INVENTORY_DEFAULTS: InventorySettings = {
  deadStockDays: 120,
  carryingRate: 0.2,
  expectedROI: 0.25,
  serviceLevelZ: 1.65,
  dailyDemandWindowDays: 90,
  orderCost: 500_000,
  minTurnover: 0.5,
  ageDiscountTiers: [],
};

const KEYS = Object.keys(INVENTORY_DEFAULTS) as (keyof InventorySettings)[];

export async function getInventorySettings(): Promise<InventorySettings> {
  const rows = await prisma.setting.findMany({ where: { key: { in: KEYS } } });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const out = { ...INVENTORY_DEFAULTS };
  for (const key of KEYS) {
    const v = byKey.get(key);
    if (v === undefined || v === null) continue;
    // Settings.value is JSON: numbers arrive as numbers, tiers as an array.
    (out[key] as unknown) = v;
  }
  return out;
}

export async function saveInventorySettings(
  patch: Partial<InventorySettings>,
): Promise<InventorySettings> {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    await prisma.setting.upsert({
      where: { key },
      update: { value: value as object },
      create: { key, value: value as object },
    });
  }
  return getInventorySettings();
}
