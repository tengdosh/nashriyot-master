import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { runWithAudit } from "@/lib/audit-context";
import { generateJson } from "@/lib/ai/claude";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type EntryType = "sale" | "payment" | "expense" | "transfer";

export type ParsedEntry = {
  type:         EntryType;
  amount:       number | null;
  currency:     string;
  description:  string;
  date:         string | null;         // "YYYY-MM-DD" or null
  partnerName:  string | null;
  productName:  string | null;
  qty:          number | null;
  unitPrice:    number | null;
  unknownFields: string[];             // fields AI could not parse reliably
};

const parsedEntrySchema = z.object({
  amount:       z.number().nullable(),
  currency:     z.string().default("UZS"),
  description:  z.string(),
  date:         z.string().nullable(),
  partnerName:  z.string().nullable(),
  productName:  z.string().nullable(),
  qty:          z.number().nullable(),
  unitPrice:    z.number().nullable(),
  unknownFields: z.array(z.string()).default([]),
});

// ─────────────────────────────────────────────────────────────────────────────
// AI parser
// ─────────────────────────────────────────────────────────────────────────────

const ENTRY_SYSTEM = `Sen nashriyot ERP tizimi uchun ma'lumot ajratuvchisan.
Foydalanuvchi o'zbek tilida erkin matn yuboradi.
Sening vazifang: maydonlarni ajratib, JSON formatda qaytarish.
QOIDA: agar aniq bilmasang, null qaytar. Taxmin TAQIQLANDIR.
Sana formati: YYYY-MM-DD yoki null.
Pul miqdori: son (son bo'lmasa null). Valyuta: UZS/USD/EUR/TRY.
unknownFields - aniq ajrata olmagan maydonlar ro'yxati.`;

export async function parseEntryWithAI(
  text: string,
  type: EntryType,
): Promise<ParsedEntry> {
  const userPrompt = `Tur: ${type}\nMatn: "${text}"`;
  const result = await generateJson(ENTRY_SYSTEM, userPrompt, { maxTokens: 512 });

  if (!result) {
    // Graceful degradation — return skeleton with only description
    return {
      type,
      amount:       null,
      currency:     "UZS",
      description:  text,
      date:         null,
      partnerName:  null,
      productName:  null,
      qty:          null,
      unitPrice:    null,
      unknownFields: ["amount", "date", "partnerName", "productName"],
    };
  }

  try {
    const parsed = parsedEntrySchema.parse(result.data);
    return { type, ...parsed };
  } catch {
    return {
      type,
      amount:       null,
      currency:     "UZS",
      description:  text,
      date:         null,
      partnerName:  null,
      productName:  null,
      qty:          null,
      unitPrice:    null,
      unknownFields: ["amount", "date", "partnerName", "productName"],
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Save DRAFT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Save a parsed entry as a DRAFT. Always creates a draft — never a confirmed
 * record. Final approval is only possible through the web UI.
 *
 * Returns the created record id and type for display.
 */
export async function saveDraftEntry(
  parsed: ParsedEntry,
  userId: string,
  entityId: string,  // resolved from the user's entityAccess
): Promise<{ id: string; kind: string }> {
  return runWithAudit({ userId }, async () => {
    switch (parsed.type) {
      case "expense":
        return saveDraftExpense(parsed, userId, entityId);
      case "sale":
        return saveDraftSale(parsed, userId, entityId);
      case "payment":
        return saveDraftPayment(parsed, userId, entityId);
      case "transfer":
        return saveDraftTransfer(parsed, userId, entityId);
    }
  });
}

// ── expense → CostEntry ───────────────────────────────────────────────────────

async function saveDraftExpense(
  parsed: ParsedEntry,
  _userId: string,
  entityId: string,
): Promise<{ id: string; kind: string }> {
  const amount = parsed.amount ?? 0;
  const entry = await prisma.costEntry.create({
    data: {
      entityId,
      scope:     "FIXED",
      category:  "BOSHQA",
      amount:    new Prisma.Decimal(amount),
      currency:  (parsed.currency as "UZS" | "USD" | "TRY" | "EUR") ?? "UZS",
      rate:      new Prisma.Decimal(1),
      amountUZS: new Prisma.Decimal(amount),
      date:      parsed.date ? new Date(parsed.date) : new Date(),
      campaign:  parsed.description,
      refType:   "TelegramDraft",
      refId:     null,
    },
  });
  return { id: entry.id, kind: "CostEntry" };
}

// ── sale → SalesOrder DRAFT ───────────────────────────────────────────────────

async function saveDraftSale(
  parsed: ParsedEntry,
  _userId: string,
  entityId: string,
): Promise<{ id: string; kind: string }> {
  // We need a channel and warehouse. Use the first RETAIL channel and
  // first MAIN warehouse for this entity as sensible defaults.
  const [channel, warehouse] = await Promise.all([
    prisma.salesChannel.findFirst({ where: { type: "RETAIL" }, orderBy: { name: "asc" } }),
    prisma.warehouse.findFirst({ where: { entityId, type: "MAIN", archivedAt: null } }),
  ]);

  if (!channel || !warehouse) {
    // Fallback: store as a Lead (still a useful DRAFT)
    const lead = await prisma.lead.create({
      data: {
        source:       "TELEGRAM",
        contact:      parsed.partnerName ?? "Telegram",
        status:       "NEW",
        notes:        [{ at: new Date().toISOString(), text: parsed.description }],
      },
    });
    return { id: lead.id, kind: "Lead" };
  }

  const order = await prisma.salesOrder.create({
    data: {
      channelId:    channel.id,
      entityId,
      warehouseId:  warehouse.id,
      customerName: parsed.partnerName ?? "Telegram draft",
      status:       "DRAFT",
      orderDate:    parsed.date ? new Date(parsed.date) : new Date(),
    },
  });
  return { id: order.id, kind: "SalesOrder" };
}

// ── payment → Payment ─────────────────────────────────────────────────────────

async function saveDraftPayment(
  parsed: ParsedEntry,
  _userId: string,
  entityId: string,
): Promise<{ id: string; kind: string }> {
  const amount = parsed.amount ?? 0;
  const payment = await prisma.payment.create({
    data: {
      direction:   "IN",
      method:      "CASH",
      entityId,
      amount:      new Prisma.Decimal(amount),
      currency:    (parsed.currency as "UZS" | "USD" | "TRY" | "EUR") ?? "UZS",
      reconStatus: "PENDING",
      refType:     "TelegramDraft",
      date:        parsed.date ? new Date(parsed.date) : new Date(),
    },
  });
  return { id: payment.id, kind: "Payment" };
}

// ── transfer → TransferOrder DRAFT ───────────────────────────────────────────

async function saveDraftTransfer(
  parsed: ParsedEntry,
  _userId: string,
  entityId: string,
): Promise<{ id: string; kind: string }> {
  // We need a toEntityId. For a DRAFT we just use the same entity as fallback.
  const toEntity = await prisma.entity.findFirst({
    where: { archivedAt: null, id: { not: entityId } },
    orderBy: { code: "asc" },
  });

  const order = await prisma.transferOrder.create({
    data: {
      fromEntityId: entityId,
      toEntityId:   toEntity?.id ?? entityId,
      status:       "DRAFT",
      date:         parsed.date ? new Date(parsed.date) : new Date(),
    },
  });
  return { id: order.id, kind: "TransferOrder" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry token helpers (for future per-user token auth)
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function createEntryToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await prisma.telegramEntryToken.create({
    data: {
      token,
      userId,
      scope:     "entry.write",
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });
  return token;
}

export async function resolveEntryToken(token: string): Promise<string | null> {
  const row = await prisma.telegramEntryToken.findUnique({ where: { token } });
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt < new Date()) return null;
  return row.userId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: first entityId for a user
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the first entity id from the user's entityAccess (the entity they
 * are most likely to be working in). Falls back to any entity in the system.
 */
export async function resolveUserEntity(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where:   { id: userId },
    include: { entityAccess: { select: { id: true }, take: 1 } },
  });
  if (user?.entityAccess[0]?.id) return user.entityAccess[0].id;
  // Last resort: any non-archived entity
  const entity = await prisma.entity.findFirst({ where: { archivedAt: null }, orderBy: { code: "asc" } });
  return entity?.id ?? null;
}
