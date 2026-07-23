import type { PrismaClient } from "@prisma/client";
import { getAuditUserId } from "./audit-context";

/**
 * Prisma client extension: logs every create/update/delete/upsert into audit_log
 * with before/after JSONB and the userId from the audit context.
 *
 * Notes / limitations:
 *   - Uses the *unextended* `base` client for the before-read and the audit write,
 *     so it never recurses and never audits the AuditLog table itself.
 *   - Audit rows are written outside interactive transactions, so a rolled-back
 *     tx can leave an orphan audit row. Acceptable for now; revisit if needed.
 *   - Bulk ops (createMany/updateMany/deleteMany) are not audited per-row.
 */
const AUDITED = new Set(["create", "update", "delete", "upsert"]);

function toJsonSafe(value: unknown): object | undefined {
  if (value === null || value === undefined) return undefined;
  return JSON.parse(
    JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
  );
}

function delegateName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

export function auditExtension(base: PrismaClient) {
  return {
    name: "audit-log",
    query: {
      $allModels: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async $allOperations({ model, operation, args, query }: any) {
          if (!model || model === "AuditLog" || !AUDITED.has(operation)) {
            return query(args);
          }

          const userId = getAuditUserId();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const delegate = (base as any)[delegateName(model)];

          let before: unknown;
          if (operation !== "create" && args?.where) {
            try {
              before = await delegate.findUnique({ where: args.where });
            } catch {
              before = undefined;
            }
          }

          const result = await query(args);

          try {
            const action =
              operation === "delete" ? "DELETE" : operation === "create" ? "CREATE" : "UPDATE";
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rec = (result ?? before) as any;
            const entityId = rec?.id ? String(rec.id) : JSON.stringify(args?.where ?? {});
            await base.auditLog.create({
              data: {
                userId,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                action: action as any,
                entity: model,
                entityId,
                before: toJsonSafe(before),
                after: operation === "delete" ? undefined : toJsonSafe(result),
              },
            });
          } catch {
            // Never let auditing break the primary operation.
          }

          return result;
        },
      },
    },
  };
}
