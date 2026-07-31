import { createHmac, randomInt } from "node:crypto";
import { prisma } from "@/lib/db";
import { menuForPermissions } from "@/lib/reports-catalog";
import { callerFromUserId } from "@/lib/reports-auth";
import { matchesSubscription, renderNotification } from "@/lib/notify";

export class TelegramError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelegramError";
  }
}

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes (playbook)

/** Deterministic keyed hash so a submitted code is one indexed lookup, not a scan. */
function hashCode(code: string): string {
  const key = process.env.AUTH_SECRET;
  if (!key) throw new Error("AUTH_SECRET qiymati o'rnatilmagan — server sozlamalarini tekshiring");
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

export type ChatPush = { chatId: string; notifications: { id: string; text: string }[] };

/**
 * Pending push notifications per subscribed chat (playbook §5.2). Returns unread
 * notifications created since `since` that each chat opted into AND its linked
 * user is permitted to see (entity-scoped). The bot dedupes by notification id.
 */
export async function pendingPushes(sinceIso?: string): Promise<ChatPush[]> {
  const since = sinceIso ? new Date(sinceIso) : new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [notifications, links] = await Promise.all([
    prisma.notification.findMany({
      where: { isRead: false, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      take: 200,
    }),
    prisma.telegramLink.findMany({
      include: {
        user: {
          include: {
            entityAccess: { select: { id: true } },
            roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
          },
        },
      },
    }),
  ]);
  if (notifications.length === 0 || links.length === 0) return [];

  const out: ChatPush[] = [];
  for (const link of links) {
    if (!link.user || !link.user.isActive) continue;
    const permissions = Array.from(
      new Set(link.user.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.code))),
    );
    const entityAccess = new Set(link.user.entityAccess.map((e) => e.id));
    const subscription = link.subscriptions as { daily?: boolean; events?: string[] } | null;

    const matched = notifications.filter((n) => {
      if (!matchesSubscription(n.type, subscription, permissions)) return false;
      // Entity-scoped notifications only reach users with that entity in access.
      if (n.entityId && !entityAccess.has(n.entityId)) return false;
      return true;
    });
    if (matched.length === 0) continue;

    out.push({
      chatId: link.chatId,
      notifications: matched.map((n) => ({
        id: n.id,
        text: renderNotification({ type: n.type, severity: n.severity, title: n.title, body: n.body, linkUrl: n.linkUrl }),
      })),
    });
  }
  return out;
}
