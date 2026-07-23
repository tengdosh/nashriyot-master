import { PrismaClient } from "@prisma/client";
import { auditExtension } from "./audit";

/**
 * Single Prisma client (audit-extended) with the usual dev hot-reload guard.
 * Import `{ prisma }` everywhere; never `new PrismaClient()` elsewhere.
 */
function createPrisma() {
  const base = new PrismaClient();
  return base.$extends(auditExtension(base));
}

const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrisma>;
};

export const prisma = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
