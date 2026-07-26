import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { pendingPushes } from "@/lib/services/telegram-service";

const DIRECTOR = "user-director";
const CHAT = "push-test-chat-1";
const notifIds: string[] = [];

afterAll(async () => {
  await prisma.telegramLink.deleteMany({ where: { OR: [{ chatId: CHAT }, { userId: DIRECTOR }] } });
  await prisma.notification.deleteMany({ where: { id: { in: notifIds } } });
});

describe("M16 push — pendingPushes", () => {
  it("returns opted-in, permitted, recent notifications for a subscribed chat", async () => {
    await prisma.telegramLink.upsert({
      where: { userId: DIRECTOR },
      update: { chatId: CHAT, subscriptions: { daily: true, events: ["ROP", "AR_OVERDUE"] } },
      create: { chatId: CHAT, userId: DIRECTOR, subscriptions: { daily: true, events: ["ROP", "AR_OVERDUE"] } },
    });

    const rop = await prisma.notification.create({
      data: { type: "ROP", severity: "WARNING", title: "PUSHTEST ROP", body: "zaxira kam", linkUrl: "/inventory" },
    });
    const dead = await prisma.notification.create({
      data: { type: "DEAD_STOCK", severity: "INFO", title: "PUSHTEST dead", body: "o'lik" }, // not subscribed
    });
    notifIds.push(rop.id, dead.id);

    const since = new Date(Date.now() - 60_000).toISOString();
    const pushes = await pendingPushes(since);
    const mine = pushes.find((p) => p.chatId === CHAT);
    expect(mine).toBeDefined();
    const ids = mine!.notifications.map((n) => n.id);
    expect(ids).toContain(rop.id); // subscribed + permitted
    expect(ids).not.toContain(dead.id); // not opted-in
    expect(mine!.notifications.find((n) => n.id === rop.id)!.text).toContain("PUSHTEST ROP");
  });

  it("excludes notifications older than the since cutoff", async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const pushes = await pendingPushes(future);
    expect(pushes.find((p) => p.chatId === CHAT)).toBeUndefined();
  });
});
