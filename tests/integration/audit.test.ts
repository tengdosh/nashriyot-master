import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { runWithAudit } from "@/lib/audit-context";

// Integration test — requires the dev Postgres (docker compose up -d).
const KEY = `test-audit-${Date.now()}`;

async function cleanup() {
  const settings = await prisma.setting.findMany({ where: { key: KEY }, select: { id: true } });
  await prisma.auditLog.deleteMany({
    where: { entity: "Setting", entityId: { in: settings.map((s) => s.id) } },
  });
  await prisma.setting.deleteMany({ where: { key: KEY } });
}

describe("audit extension (Prisma → audit_log)", () => {
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("writes a CREATE audit row with after + userId", async () => {
    const created = await runWithAudit({ userId: "user-admin" }, async () => {
      // Must await INSIDE the context: Prisma promises are lazy and would
      // otherwise execute after the ALS context exits (userId would be null).
      return await prisma.setting.create({ data: { key: KEY, value: { n: 1 } } });
    });

    const logs = await prisma.auditLog.findMany({
      where: { entity: "Setting", entityId: created.id },
    });
    const createLog = logs.find((l) => l.action === "CREATE");

    expect(createLog).toBeTruthy();
    expect(createLog!.userId).toBe("user-admin");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((createLog!.after as any).key).toBe(KEY);
    expect(createLog!.before).toBeNull();
  });

  it("writes an UPDATE audit row with before + after", async () => {
    const before = await prisma.setting.findUniqueOrThrow({ where: { key: KEY } });

    await runWithAudit({ userId: "user-admin" }, async () => {
      await prisma.setting.update({ where: { key: KEY }, data: { value: { n: 2 } } });
    });

    const updateLog = await prisma.auditLog.findFirst({
      where: { entity: "Setting", entityId: before.id, action: "UPDATE" },
      orderBy: { createdAt: "desc" },
    });

    expect(updateLog).toBeTruthy();
    expect(updateLog!.userId).toBe("user-admin");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((updateLog!.before as any).value.n).toBe(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((updateLog!.after as any).value.n).toBe(2);
  });
});
