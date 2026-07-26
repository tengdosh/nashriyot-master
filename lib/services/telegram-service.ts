import { createHmac, randomInt } from "node:crypto";
import { prisma } from "@/lib/db";
import { menuForPermissions } from "@/lib/reports-catalog";
import { callerFromUserId } from "@/lib/reports-auth";

export class TelegramError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelegramError";
  }
}

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes (playbook)

/** Deterministic keyed hash so a submitted code is one indexed lookup, not a scan. */
function hashCode(code: string): string {
  const key = process.env.AUTH_SECRET ?? "dev-secret";
  return createHmac("sha256", key).update(`tg:${code}`).digest("hex");
}

/**
 * Generate a one-time 6-digit code for a user. Only the hash is stored; the
 * plaintext is returned once (shown in the profile page) and expires in 10 min.
 */
export async function generateLinkCode(userId: string): Promise<{ code: string; expiresAt: Date }> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  await prisma.telegramLinkCode.create({
    data: { userId, codeHash: hashCode(code), expiresAt },
  });
  return { code, expiresAt };
}

export type ChatIdentity = {
  userId: string;
  permissions: string[];
  entityAccess: string[];
  menu: { name: string; label: string; icon: string }[];
  subscriptions: unknown;
};

/** Bind a Telegram chat to the user who owns a still-valid code. */
export async function linkChat(chatId: string, code: string): Promise<ChatIdentity> {
  const row = await prisma.telegramLinkCode.findFirst({
    where: { codeHash: hashCode(code), usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!row) throw new TelegramError("Kod noto'g'ri yoki muddati o'tgan");

  await prisma.$transaction([
    prisma.telegramLinkCode.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    prisma.telegramLink.upsert({
      where: { userId: row.userId },
      update: { chatId },
      create: { chatId, userId: row.userId, subscriptions: { daily: false, events: [] } },
    }),
  ]);

  return chatIdentity(chatId).then((i) => {
    if (!i) throw new TelegramError("Ulash amalga oshmadi");
    return i;
  });
}

/** Remove a chat's binding. Returns true if a link existed. */
export async function unlinkChat(chatId: string): Promise<boolean> {
  const existing = await prisma.telegramLink.findUnique({ where: { chatId } });
  if (!existing) return false;
  await prisma.telegramLink.delete({ where: { chatId } });
  return true;
}

/** Who is this chat, and what may they see? Null if the chat is not linked. */
export async function chatIdentity(chatId: string): Promise<ChatIdentity | null> {
  const link = await prisma.telegramLink.findUnique({ where: { chatId } });
  if (!link) return null;
  const caller = await callerFromUserId(link.userId);
  return {
    userId: caller.id,
    permissions: caller.permissions,
    entityAccess: caller.entityAccess,
    menu: menuForPermissions(caller.permissions).map((d) => ({ name: d.name, label: d.menuLabel, icon: d.menuIcon })),
    subscriptions: link.subscriptions,
  };
}

/** Update a chat's push subscriptions (spec §5.2 /obuna). */
export async function setSubscriptions(chatId: string, subscriptions: unknown): Promise<void> {
  const link = await prisma.telegramLink.findUnique({ where: { chatId } });
  if (!link) throw new TelegramError("Chat ulanmagan");
  await prisma.telegramLink.update({ where: { chatId }, data: { subscriptions: subscriptions as object } });
}
