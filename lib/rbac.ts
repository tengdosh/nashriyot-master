/** Thrown by the assert* helpers. `status` maps to an HTTP code (401/403). */
export class AuthzError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "AuthzError";
  }
}

/** Minimal user shape the RBAC predicates need (pure & test-friendly). */
export type RbacUser = {
  id?: string;
  permissions?: string[];
  roles?: string[];
  entityAccess?: string[];
  contributorId?: string | null;
};

// ── Pure predicates ───────────────────────────────────────────────────────────
export function hasPermission(user: RbacUser | null | undefined, code: string): boolean {
  return !!user?.permissions?.includes(code);
}

export function hasRole(user: RbacUser | null | undefined, code: string): boolean {
  return !!user?.roles?.includes(code);
}

/** Row-level: which subjects (entities) the user is allowed to see. */
export function canAccessEntity(user: RbacUser | null | undefined, entityId: string): boolean {
  return !!user?.entityAccess?.includes(entityId);
}

export function accessibleEntityIds(user: RbacUser | null | undefined): string[] {
  return user?.entityAccess ?? [];
}

// ── Pure assertions (throw AuthzError) ────────────────────────────────────────
export function assertPermission(user: RbacUser | null | undefined, code: string): void {
  if (!user) throw new AuthzError(401, "Avtorizatsiya talab qilinadi");
  if (!hasPermission(user, code)) throw new AuthzError(403, `Ruxsat yo'q: ${code}`);
}

export function assertRowAccess(
  user: RbacUser | null | undefined,
  scope: { entityId?: string | null; contributorId?: string | null },
): void {
  if (!user) throw new AuthzError(401, "Avtorizatsiya talab qilinadi");
  if (scope.entityId && !canAccessEntity(user, scope.entityId)) {
    throw new AuthzError(403, "Bu sub'ekt ma'lumotiga ruxsat yo'q");
  }
  if (scope.contributorId && user.contributorId !== scope.contributorId) {
    throw new AuthzError(403, "Bu hissador ma'lumotiga ruxsat yo'q");
  }
}

// ── Session-bound async wrappers (used in server code) ────────────────────────
export async function getSessionUser() {
  // Lazy import keeps the auth/Prisma chain out of pure-RBAC unit tests.
  const { auth } = await import("@/auth");
  const session = await auth();
  return session?.user ?? null;
}

export async function requirePermission(code: string) {
  const user = await getSessionUser();
  assertPermission(user, code);
  return user!;
}

export async function requireRowAccess(scope: {
  entityId?: string | null;
  contributorId?: string | null;
}) {
  const user = await getSessionUser();
  assertRowAccess(user, scope);
  return user!;
}
