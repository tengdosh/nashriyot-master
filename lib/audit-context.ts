import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Request-scoped audit context. The Prisma audit extension (lib/audit.ts) reads
 * the current userId from here so every write can be attributed to a user.
 * Server actions / route handlers / jobs wrap their work in `runWithAudit`.
 *
 * IMPORTANT: Prisma promises are lazy — always `await` writes INSIDE the callback:
 *   await runWithAudit({ userId }, async () => { await prisma.x.create(...) })
 * A non-awaited write runs after the context exits and loses the userId.
 */
type AuditContext = { userId?: string | null };

const storage = new AsyncLocalStorage<AuditContext>();

export function runWithAudit<T>(ctx: AuditContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getAuditUserId(): string | null {
  return storage.getStore()?.userId ?? null;
}
