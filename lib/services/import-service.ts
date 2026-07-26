import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runWithAudit } from "@/lib/audit-context";
import { stockIn } from "@/lib/services/inventory-service";
import {
  parseCsv,
  mapRows,
  normalizeTitleKey,
  importProductSku,
  type TemplateName,
  type MappedRecord,
  type RowError,
} from "@/lib/import-map";

/**
 * Transactional CSV import (spec v2 §9). Two templates:
 *  - kirimlar → catalog (titles/products) + suppliers + FIFO inbound layers
 *  - sotuv    → clients + historical SHIPPED orders with SEALED cogs/discount
 * Dry-run (`previewImport`) never writes; `commitImport` is one transaction and
 * audited. Catalog is deduped (title by normalized key, product by import SKU,
 * partner by name) so re-importing the same spelling is idempotent.
 */

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" ? v : 0);
const date = (v: unknown) => (v instanceof Date ? v : new Date());

/**
 * Discount cell → a rate. Accepts both forms real files use: a fraction
 * (0.05 → 5%) or a percentage integer (5 → 5%, 12 → 12%). Anything ≤1 is taken
 * as a fraction; 1–100 as a percentage; out of range → 0. Capped below 1.
 */
function toRate(discount: number): Prisma.Decimal {
  if (discount <= 0) return D(0);
  const rate = discount <= 1 ? discount : discount <= 100 ? discount / 100 : 0;
  return D(Math.min(rate, 0.99));
}

export type ImportSummary = {
  template: TemplateName;
  rows: number;
  newTitles: number;
  newProducts: number;
  newPartners: number;
  layers: number; // kirimlar
  orders: number; // sotuv
  totalValue: number;
};

export type ImportPreview = {
  summary: ImportSummary;
  errors: RowError[];
  sample: MappedRecord[];
  committed: false;
};

// ── Dry-run preview (no writes) ────────────────────────────────────────────────

export async function previewImport(template: TemplateName, csvText: string): Promise<ImportPreview> {
  const { records, errors } = mapRows(template, parseCsv(csvText));

  const titleKeys = new Set<string>();
  const skus = new Set<string>();
  const partnerNames = new Set<string>();
  let totalValue = 0;

  for (const rec of records) {
    titleKeys.add(normalizeTitleKey(str(rec.book)));
    skus.add(importProductSku(str(rec.book)));
    if (template === "kirimlar") {
      partnerNames.add(str(rec.supplier));
      totalValue += num(rec.qty) * num(rec.unitCost);
    } else {
      partnerNames.add(str(rec.client));
      const rate = toRate(num(rec.discount)).toNumber();
      totalValue += num(rec.qty) * num(rec.price) * (1 - rate);
    }
  }

  // Which already exist → "new" counts (read-only).
  const [existingProducts, existingPartners] = await Promise.all([
    prisma.product.findMany({ where: { sku: { in: [...skus] } }, select: { sku: true } }),
    prisma.partner.findMany({ where: { name: { in: [...partnerNames] } }, select: { name: true } }),
  ]);
  const existingSku = new Set(existingProducts.map((p) => p.sku));
  const existingPartner = new Set(existingPartners.map((p) => p.name));

  const summary: ImportSummary = {
    template,
    rows: records.length,
    newTitles: titleKeys.size, // titles have no unique key column; upper bound
    newProducts: [...skus].filter((s) => !existingSku.has(s)).length,
    newPartners: [...partnerNames].filter((n) => !existingPartner.has(n)).length,
    layers: template === "kirimlar" ? records.length : 0,
    orders: template === "sotuv" ? records.length : 0,
    totalValue,
  };

  return { summary, errors, sample: records.slice(0, 10), committed: false };
}

// ── Commit (transactional) ──────────────────────────────────────────────────────

export async function commitImport(
  template: TemplateName,
  csvText: string,
  userId: string,
): Promise<ImportSummary & { committed: true; errors: RowError[] }> {
  const { records, errors } = mapRows(template, parseCsv(csvText));
  if (records.length === 0) throw new ImportError("Import uchun yaroqli qator yo'q");

  const summary = await runWithAudit({ userId }, () =>
    prisma.$transaction(async (txAny) => {
      const tx = txAny as unknown as Prisma.TransactionClient;
      // Default context: a publisher entity + its MAIN warehouse; channels by type.
      const entity =
        (await tx.entity.findFirst({ where: { type: "PUBLISHER", archivedAt: null }, orderBy: { code: "asc" } })) ??
        (await tx.entity.findFirstOrThrow({ orderBy: { code: "asc" } }));
      const warehouse =
        (await tx.warehouse.findFirst({ where: { entityId: entity.id, type: "MAIN", archivedAt: null } })) ??
        (await tx.warehouse.findFirstOrThrow({ where: { entityId: entity.id } }));

      const titleByKey = new Map<string, string>();
      const productBySku = new Map<string, string>();
      const partnerByName = new Map<string, string>();
      const channelByType = new Map<string, string>();
      const s: ImportSummary = {
        template, rows: records.length, newTitles: 0, newProducts: 0, newPartners: 0, layers: 0, orders: 0, totalValue: 0,
      };

      const resolveTitle = async (rawName: string): Promise<string> => {
        const key = normalizeTitleKey(rawName);
        const cached = titleByKey.get(key);
        if (cached) return cached;
        const t = await tx.title.create({
          data: { workTitle: rawName.trim(), ownerType: "OWN", entityId: entity.id, language: "uz", keywords: [], themaCodes: [], bisacCodes: [] },
        });
        titleByKey.set(key, t.id);
        s.newTitles += 1;
        return t.id;
      };

      const resolveProduct = async (rawName: string, listPrice: number): Promise<string> => {
        const sku = importProductSku(rawName);
        const cached = productBySku.get(sku);
        if (cached) return cached;
        const existing = await tx.product.findUnique({ where: { sku }, select: { id: true } });
        if (existing) {
          productBySku.set(sku, existing.id);
          return existing.id;
        }
        const titleId = await resolveTitle(rawName);
        const p = await tx.product.create({
          data: { titleId, format: "PAPERBACK", sku, listPrice: D(listPrice > 0 ? listPrice : 0), vatRate: D(0) },
        });
        productBySku.set(sku, p.id);
        s.newProducts += 1;
        return p.id;
      };

      const resolvePartner = async (name: string, role: "SUPPLIER" | "CLIENT"): Promise<string> => {
        const key = name.trim();
        const cached = partnerByName.get(key);
        if (cached) return cached;
        const existing = await tx.partner.findFirst({ where: { name: key }, select: { id: true } });
        if (existing) {
          partnerByName.set(key, existing.id);
          return existing.id;
        }
        const p = await tx.partner.create({ data: { name: key, roles: [role], currency: "UZS" } });
        partnerByName.set(key, p.id);
        s.newPartners += 1;
        return p.id;
      };

      const resolveChannel = async (holat: string): Promise<string> => {
        const wholesale = /ulgurji|opt|распрод|оптом/i.test(holat);
        const type = wholesale ? "DISTRIBUTOR" : "RETAIL";
        const cached = channelByType.get(type);
        if (cached) return cached;
        const found =
          (await tx.salesChannel.findFirst({ where: { type, archivedAt: null } })) ??
          (await tx.salesChannel.create({ data: { name: `Import (${wholesale ? "Ulgurji" : "Chakana"})`, type, defaultDiscount: D(0), feeRate: D(0) } }));
        channelByType.set(type, found.id);
        return found.id;
      };

      for (const rec of records) {
        const book = str(rec.book);
        if (template === "kirimlar") {
          const productId = await resolveProduct(book, num(rec.price));
          await resolvePartner(str(rec.supplier), "SUPPLIER");
          const qty = num(rec.qty);
          const unitCost = num(rec.unitCost);
          await stockIn(tx, { productId, warehouseId: warehouse.id, qty, unitCostUZS: unitCost, refType: "Import", date: date(rec.date) });
          s.layers += 1;
          s.totalValue += qty * unitCost;
        } else {
          const price = num(rec.price);
          const productId = await resolveProduct(book, price);
          const partnerId = await resolvePartner(str(rec.client), "CLIENT");
          const channelId = await resolveChannel(str(rec.status));
          const qty = num(rec.qty);
          const rate = toRate(num(rec.discount));
          const netUnit = D(price).times(D(1).minus(rate));
          const cogsUnit = D(num(rec.cost));
          const cmUnit = netUnit.minus(cogsUnit);
          const when = date(rec.date);
          await tx.salesOrder.create({
            data: {
              channelId, entityId: entity.id, warehouseId: warehouse.id, partnerId,
              status: "SHIPPED", orderDate: when, shippedDate: when,
              lines: { create: [{ productId, qty, unitPrice: D(price), discountRate: rate, cogsUnit, cmUnit }] },
            },
          });
          s.orders += 1;
          s.totalValue += netUnit.times(qty).toNumber();
        }
      }
      return s;
    }, { timeout: 600_000, maxWait: 60_000 }),
  );

  return { ...summary, committed: true, errors };
}
