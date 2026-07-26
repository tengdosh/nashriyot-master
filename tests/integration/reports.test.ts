import { describe, it, expect, afterAll } from "vitest";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { runReport, ReportError } from "@/lib/services/reports-service";
import { callerFromUserId, hasValidServiceToken } from "@/lib/reports-auth";
import {
  generateLinkCode,
  linkChat,
  unlinkChat,
  chatIdentity,
  TelegramError,
} from "@/lib/services/telegram-service";

const DIRECTOR = "user-director";
const CHAT = "test-chat-9001";

afterAll(async () => {
  await prisma.telegramLink.deleteMany({ where: { OR: [{ chatId: CHAT }, { userId: DIRECTOR }] } });
  await prisma.telegramLinkCode.deleteMany({ where: { userId: DIRECTOR } });
});

// Minimal stand-in for NextRequest — hasValidServiceToken only reads headers.
const reqWith = (auth?: string) =>
  ({ headers: new Headers(auth ? { authorization: auth } : {}) }) as unknown as NextRequest;

describe("M16 — reports auth + catalog", () => {
  it("loads a director's permissions and entity access by id", async () => {
    const caller = await callerFromUserId(DIRECTOR);
    expect(caller.permissions).toContain("reports.read");
    expect(caller.entityAccess.length).toBeGreaterThan(0);
  });

  it("validates the service token constant-time", () => {
    const token = process.env.REPORTS_API_TOKEN!;
    expect(hasValidServiceToken(reqWith(`Bearer ${token}`))).toBe(true);
    expect(hasValidServiceToken(reqWith("Bearer wrong"))).toBe(false);
    expect(hasValidServiceToken(reqWith())).toBe(false);
  });

  it("refuses an unknown report and an unpermitted one", async () => {
    const caller = await callerFromUserId(DIRECTOR);
    await expect(runReport("drop-table", {}, caller)).rejects.toThrow(ReportError);
    const noPerms = { id: DIRECTOR, permissions: [], entityAccess: [] };
    await expect(runReport("kpi-digest", {}, noPerms)).rejects.toThrow(ReportError);
  });

  it("runs kpi-digest and returns an envelope with generatedAt", async () => {
    const caller = await callerFromUserId(DIRECTOR);
    const r = await runReport("kpi-digest", {}, caller);
    expect(r.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const d = r.data as { cash: number; ar: number; ap: number; openAlerts: number };
    expect(typeof d.cash).toBe("number");
    expect(typeof d.openAlerts).toBe("number");
  });

  it("runs sales-summary with a period and yields channel + top5 arrays", async () => {
    const caller = await callerFromUserId(DIRECTOR);
    const r = await runReport("sales-summary", { period: "year" }, caller);
    const d = r.data as { net: number; units: number; channels: unknown[]; top5: unknown[] };
    expect(typeof d.net).toBe("number");
    expect(Array.isArray(d.channels)).toBe(true);
    expect(Array.isArray(d.top5)).toBe(true);
    expect((r.params as { period: string }).period).toBe("year");
  });

  it("runs agents-kpi", async () => {
    const caller = await callerFromUserId(DIRECTOR);
    const r = await runReport("agents-kpi", {}, caller);
    expect(Array.isArray((r.data as { agents: unknown[] }).agents)).toBe(true);
  });
});

describe("M16 — telegram linking", () => {
  it("links a chat with a valid code, exposes a permitted menu, then unlinks", async () => {
    const { code } = await generateLinkCode(DIRECTOR);
    expect(code).toMatch(/^\d{6}$/);

    const identity = await linkChat(CHAT, code);
    expect(identity.userId).toBe(DIRECTOR);
    expect(identity.menu.length).toBeGreaterThan(0);
    expect(identity.menu.map((m) => m.name)).toContain("kpi-digest");

    // chatIdentity resolves the same chat
    const again = await chatIdentity(CHAT);
    expect(again?.userId).toBe(DIRECTOR);

    // the code is single-use
    await expect(linkChat("other-chat", code)).rejects.toThrow(TelegramError);

    expect(await unlinkChat(CHAT)).toBe(true);
    expect(await unlinkChat(CHAT)).toBe(false);
    expect(await chatIdentity(CHAT)).toBeNull();
  });

  it("rejects a wrong code", async () => {
    await expect(linkChat(CHAT, "000000")).rejects.toThrow(TelegramError);
  });
});
