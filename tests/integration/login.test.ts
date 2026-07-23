import { describe, it, expect, afterAll } from "vitest";
import { verify } from "@node-rs/argon2";
import { prisma } from "@/lib/db";

// Integration — requires the seeded dev Postgres (npm run db:seed).
const SEED_PASSWORD = "Parol123!";
const SEED_EMAILS = [
  "director@nashriyot.uz",
  "sales@nashriyot.uz",
  "editor@nashriyot.uz",
  "accountant@nashriyot.uz",
  "admin@nashriyot.uz",
];

async function enrich(email: string) {
  const u = await prisma.user.findUniqueOrThrow({
    where: { email },
    include: {
      entityAccess: { select: { id: true } },
      roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
    },
  });
  const permissions = new Set(u.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.code)));
  const entityAccess = u.entityAccess.map((e) => e.id).sort();
  return { permissions, entityAccess };
}

describe("credentials login — 5 seed users", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("every seed user's password verifies (argon2)", async () => {
    for (const email of SEED_EMAILS) {
      const user = await prisma.user.findUnique({ where: { email } });
      expect(user, `missing seed user ${email}`).toBeTruthy();
      expect(user!.isActive).toBe(true);
      expect(await verify(user!.passwordHash, SEED_PASSWORD), `password for ${email}`).toBe(true);
    }
  });

  it("a wrong password is rejected", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "director@nashriyot.uz" } });
    expect(await verify(user.passwordHash, "wrong-password")).toBe(false);
  });

  it("enrichment: director = all subjects + admin perm; sales = SOTUV only", async () => {
    const director = await enrich("director@nashriyot.uz");
    expect(director.permissions.has("admin.users")).toBe(true);
    expect(director.entityAccess).toEqual(["ent-sotuv", "ent-tahlil", "ent-tasnim"]);

    const sales = await enrich("sales@nashriyot.uz");
    expect(sales.entityAccess).toEqual(["ent-sotuv"]);
    expect(sales.permissions.has("royalty.approve")).toBe(false);
    expect(sales.permissions.has("sales.read")).toBe(true);
  });
});
