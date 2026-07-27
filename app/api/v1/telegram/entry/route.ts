import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { hasValidServiceToken } from "@/lib/reports-auth";
import { prisma } from "@/lib/db";
import {
  parseEntryWithAI,
  saveDraftEntry,
  resolveUserEntity,
  type EntryType,
} from "@/lib/services/telegram-entry-service";

const ENTRY_TYPES = ["sale", "payment", "expense", "transfer"] as const;

const parseSchema = z.object({
  chatId:  z.string().min(1),
  action:  z.literal("parse"),
  type:    z.enum(ENTRY_TYPES),
  text:    z.string().min(1, "Matn majburiy"),
});

const saveSchema = z.object({
  chatId:          z.string().min(1),
  action:          z.literal("save"),
  type:            z.enum(ENTRY_TYPES),
  parsed:          z.record(z.string(), z.unknown()),
  clientRequestId: z.string().min(1), // idempotency key
});

/**
 * POST /api/v1/telegram/entry
 *
 * Bot-only endpoint (Bearer REPORTS_API_TOKEN). Two actions:
 *   parse — AI parses free-text into a structured ParsedEntry preview
 *   save  — creates a DRAFT record; idempotent via clientRequestId
 *
 * IMPORTANT: only DRAFTs are ever created here. Final confirmation is always
 * done through the web UI.
 */
export async function POST(req: NextRequest) {
  if (!hasValidServiceToken(req)) {
    return NextResponse.json({ data: null, error: "Token yaroqsiz" }, { status: 401 });
  }

  try {
    const body = await req.json();

    // ── parse ────────────────────────────────────────────────────────────────
    if (body?.action === "parse") {
      const { chatId, type, text } = parseSchema.parse(body);

      const link = await prisma.telegramLink.findUnique({ where: { chatId } });
      if (!link) {
        return NextResponse.json({ data: null, error: "Chat ulanmagan. /ulash buyrug'ini bajaring." }, { status: 400 });
      }

      const parsed = await parseEntryWithAI(text, type as EntryType);
      return NextResponse.json({ data: parsed });
    }

    // ── save ─────────────────────────────────────────────────────────────────
    if (body?.action === "save") {
      const { chatId, type, parsed, clientRequestId } = saveSchema.parse(body);

      const link = await prisma.telegramLink.findUnique({ where: { chatId } });
      if (!link) {
        return NextResponse.json({ data: null, error: "Chat ulanmagan." }, { status: 400 });
      }

      // Idempotency: check if this clientRequestId was already processed.
      // We store it in the refId of an already-created record — check refType='TgReq'.
      const duplicate = await prisma.costEntry.findFirst({
        where: { refType: "TgReq", refId: clientRequestId },
        select: { id: true },
      });
      if (duplicate) {
        return NextResponse.json({ data: { id: duplicate.id, duplicate: true } });
      }

      const entityId = await resolveUserEntity(link.userId);
      if (!entityId) {
        return NextResponse.json({ data: null, error: "Foydalanuvchiga sub'ekt biriktirilmagan." }, { status: 400 });
      }

      const entry = await saveDraftEntry(
        { type: type as EntryType, ...(parsed as object) } as Parameters<typeof saveDraftEntry>[0],
        link.userId,
        entityId,
      );

      // Mark idempotency key (store clientRequestId against a CostEntry refId).
      // Only applicable for expense entries; for others we accept harmless duplicates
      // in the unlikely case of retry (drafts are cheap to discard).
      if (entry.kind === "CostEntry") {
        await prisma.costEntry.update({
          where: { id: entry.id },
          data:  { refType: "TgReq", refId: clientRequestId },
        });
      }

      return NextResponse.json({ data: { id: entry.id, kind: entry.kind } });
    }

    return NextResponse.json({ data: null, error: "Noma'lum action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server xatosi";
    return NextResponse.json({ data: null, error: message }, { status: 400 });
  }
}
