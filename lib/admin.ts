/**
 * Pure admin logic (spec v1 §5.11): the permission matrix, audit diffing and
 * temp-password generation. Kept pure so the matrix rules (system roles are
 * locked) and the audit diff are unit-tested independently of the DB.
 */

/** DIRECTOR and ADMIN always hold every permission — their matrix is read-only. */
export const SYSTEM_ROLES = ["DIRECTOR", "ADMIN"] as const;

export function isSystemRole(code: string): boolean {
  return (SYSTEM_ROLES as readonly string[]).includes(code);
}

// ── Permission matrix ─────────────────────────────────────────────────────────

export type Perm = { code: string; module: string };
export type RoleRef = { code: string; name: string };

/** Group permissions by module, modules and codes each in stable sorted order. */
export function groupPermissionsByModule(perms: Perm[]): { module: string; codes: string[] }[] {
  const byModule = new Map<string, string[]>();
  for (const p of perms) {
    byModule.set(p.module, [...(byModule.get(p.module) ?? []), p.code]);
  }
  return [...byModule.entries()]
    .map(([module, codes]) => ({ module, codes: [...codes].sort() }))
    .sort((a, b) => a.module.localeCompare(b.module));
}

export type RoleMatrix = Record<string, Set<string>>;

/** roleCode → Set(permission codes it currently holds). */
export function buildRoleMatrix(
  roles: RoleRef[],
  rolePerms: { roleCode: string; permCode: string }[],
): RoleMatrix {
  const matrix: RoleMatrix = {};
  for (const r of roles) matrix[r.code] = new Set();
  for (const rp of rolePerms) {
    if (!matrix[rp.roleCode]) matrix[rp.roleCode] = new Set();
    matrix[rp.roleCode].add(rp.permCode);
  }
  return matrix;
}

export class AdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminError";
  }
}

/**
 * Toggle one cell. System roles are immutable — attempting to change them throws
 * rather than silently no-op'ing, so the UI can surface why. Returns a NEW set
 * for the role (does not mutate the input).
 */
export function toggleMatrixCell(current: Set<string>, roleCode: string, permCode: string): Set<string> {
  if (isSystemRole(roleCode)) {
    throw new AdminError(`${roleCode} tizim roli — ruxsatlari oʻzgartirilmaydi`);
  }
  const next = new Set(current);
  if (next.has(permCode)) next.delete(permCode);
  else next.add(permCode);
  return next;
}

/** What changed for one role between the stored set and the edited set. */
export function matrixDiff(
  before: Set<string>,
  after: Set<string>,
): { added: string[]; removed: string[] } {
  const added = [...after].filter((c) => !before.has(c)).sort();
  const removed = [...before].filter((c) => !after.has(c)).sort();
  return { added, removed };
}

// ── Audit diff ────────────────────────────────────────────────────────────────

export type FieldChange = { field: string; from: unknown; to: unknown };

/**
 * Field-level diff between two audit snapshots (JSON objects). Compares by value
 * (via JSON) so nested objects/arrays are handled; keys present in only one side
 * are reported with the missing side as undefined. Timestamps churn on every
 * write, so `updatedAt` is ignored.
 */
export function auditDiff(before: unknown, after: unknown): FieldChange[] {
  const b = (before && typeof before === "object" ? before : {}) as Record<string, unknown>;
  const a = (after && typeof after === "object" ? after : {}) as Record<string, unknown>;
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const IGNORE = new Set(["updatedAt", "createdAt"]);

  const changes: FieldChange[] = [];
  for (const field of [...keys].sort()) {
    if (IGNORE.has(field)) continue;
    const fv = b[field];
    const tv = a[field];
    if (JSON.stringify(fv) !== JSON.stringify(tv)) {
      changes.push({ field, from: fv ?? null, to: tv ?? null });
    }
  }
  return changes;
}

export type AuditAction = "CREATE" | "UPDATE" | "DELETE";

/** A one-line human summary of an audit row for the log list. */
export function summarizeAudit(action: AuditAction, changes: FieldChange[]): string {
  if (action === "CREATE") return "Yaratildi";
  if (action === "DELETE") return "Oʻchirildi";
  if (changes.length === 0) return "Oʻzgarishsiz";
  return `${changes.length} maydon oʻzgardi: ${changes.map((c) => c.field).join(", ")}`;
}

// ── Temp password ─────────────────────────────────────────────────────────────

const PW_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I/O
const PW_LOWER = "abcdefghijkmnpqrstuvwxyz"; // no l/o
const PW_DIGIT = "23456789"; // no 0/1
const PW_SYM = "!@#$%*+-";

/**
 * A strong random temporary password: at least one of each class, length 14.
 * `rand` is injectable so tests are deterministic. Shown to the admin ONCE.
 */
export function generateTempPassword(length = 14, rand: () => number = Math.random): string {
  if (length < 8) throw new AdminError("Parol uzunligi kamida 8 boʻlishi kerak");
  const all = PW_UPPER + PW_LOWER + PW_DIGIT + PW_SYM;
  const pick = (set: string) => set[Math.floor(rand() * set.length)];

  const chars = [pick(PW_UPPER), pick(PW_LOWER), pick(PW_DIGIT), pick(PW_SYM)];
  for (let i = chars.length; i < length; i++) chars.push(pick(all));

  // Fisher–Yates shuffle so the guaranteed classes aren't always in front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
