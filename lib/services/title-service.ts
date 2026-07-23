import type { TitleStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runWithAudit } from "@/lib/audit-context";
import type { TitleCreateInput } from "@/lib/validators/title";

// Status machine (spec v1 §5.1): DRAFT→REVIEW→APPROVED→ACTIVE→OUT_OF_PRINT.
// Backward moves are allowed but require a reason (recorded in audit_log).
export const TITLE_ORDER: TitleStatus[] = ["DRAFT", "REVIEW", "APPROVED", "ACTIVE", "OUT_OF_PRINT"];

export const TITLE_FLOW: Record<TitleStatus, TitleStatus[]> = {
  DRAFT: ["REVIEW"],
  REVIEW: ["APPROVED", "DRAFT"],
  APPROVED: ["ACTIVE", "REVIEW"],
  ACTIVE: ["OUT_OF_PRINT"],
  OUT_OF_PRINT: ["ACTIVE"],
};

export class TransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransitionError";
  }
}

export function canTransition(from: TitleStatus, to: TitleStatus): boolean {
  return TITLE_FLOW[from]?.includes(to) ?? false;
}

export function isBackward(from: TitleStatus, to: TitleStatus): boolean {
  return TITLE_ORDER.indexOf(to) < TITLE_ORDER.indexOf(from);
}

export async function createTitle(input: TitleCreateInput, userId: string) {
  return runWithAudit({ userId }, async () => {
    return await prisma.title.create({
      data: {
        workTitle: input.workTitle,
        ownerType: input.ownerType,
        entityId: input.entityId ?? null,
        ownerPartnerId: input.ownerPartnerId ?? null,
        language: input.language,
        seriesId: input.seriesId ?? null,
        description: input.description ?? null,
        keywords: input.keywords,
        themaCodes: input.themaCodes,
        bisacCodes: input.bisacCodes,
        status: "DRAFT",
      },
    });
  });
}

export async function transitionTitle(
  titleId: string,
  to: TitleStatus,
  userId: string,
  reason?: string | null,
) {
  const title = await prisma.title.findUniqueOrThrow({ where: { id: titleId } });
  const from = title.status;

  if (!canTransition(from, to)) {
    throw new TransitionError(`Holat oʻtishi taqiqlangan: ${from} → ${to}`);
  }
  if (isBackward(from, to) && !reason?.trim()) {
    throw new TransitionError("Orqaga qaytish uchun sabab majburiy");
  }

  return runWithAudit({ userId }, async () => {
    const updated = await prisma.title.update({ where: { id: titleId }, data: { status: to } });
    // Explicit audit entry recording the transition reason (the auto-audit only
    // captures the before/after record, not the free-text reason).
    await prisma.auditLog.create({
      data: {
        userId,
        action: "UPDATE",
        entity: "Title",
        entityId: titleId,
        before: { status: from },
        after: { status: to, reason: reason ?? null },
      },
    });
    return updated;
  });
}
