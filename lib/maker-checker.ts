import { AuthzError } from "./rbac";

/**
 * Maker-checker: the user who created/submitted a document may not be the one
 * who approves it. Used for royalty runs and write-downs (spec §3.3), enforced
 * both in the UI and on the server.
 */
export function assertDifferentApprover(
  createdById: string | null | undefined,
  approverId: string | null | undefined,
): void {
  if (!approverId) throw new AuthzError(401, "Tasdiqlovchi aniqlanmadi");
  if (createdById && createdById === approverId) {
    throw new AuthzError(403, "Maker-checker: hujjatni yaratgan foydalanuvchi uni tasdiqlay olmaydi");
  }
}
