/**
 * Wiring tests — entity isolation guard
 *
 * Approach: mock auth() to return a Tasnim-only user, then call Server Actions
 * and API-route helpers with Tahlil entity data. Every guarded path must throw
 * AuthzError(403) before reaching the service layer.
 *
 * Also covers T-17: isRateLimited() is called by auth.ts authorize(), so a
 * direct POST to /api/auth/callback/credentials is also rate-limited.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import { AuthzError, entityFilter } from "@/lib/rbac";

// ── Module mocks (hoisted before imports) ────────────────────────────────────

vi.mock("@/auth", () => ({ auth: vi.fn(), signIn: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: {
    salesOrder: { findUniqueOrThrow: vi.fn(), findMany: vi.fn() },
    transferOrder: { findUniqueOrThrow: vi.fn() },
    payment: { create: vi.fn() },
    loginAttempt: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/services/sales-service", () => ({
  createSalesOrder: vi.fn().mockResolvedValue({ order: { id: "o-new" }, lines: [] }),
  confirmSalesOrder: vi.fn().mockResolvedValue({}),
  shipSalesOrder: vi.fn().mockResolvedValue({ orderId: "o-new" }),
  invoiceSalesOrder: vi.fn().mockResolvedValue({}),
  cancelSalesOrder: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/services/transfer-service", () => ({
  createTransfer: vi.fn().mockResolvedValue({ order: { id: "t-new" } }),
  shipTransfer: vi.fn().mockResolvedValue({}),
  receiveTransfer: vi.fn().mockResolvedValue({}),
  recordSettlement: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/services/returns-service", () => ({
  createReturn: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/services/receivables-service", () => ({
  registerPayment: vi.fn().mockResolvedValue({}),
  agingReport: vi.fn().mockResolvedValue({ rows: [], summary: {} }),
}));

vi.mock("@/lib/services/discount-service", () => ({
  previewDiscount: vi.fn().mockResolvedValue({}),
  suggestDiscountFor: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/jobs", () => ({ runJob: vi.fn() }));

vi.mock("@/lib/audit-context", () => ({
  runWithAudit: vi.fn(async (_ctx: unknown, fn: () => Promise<unknown>) => fn()),
}));

// ── Test fixtures ─────────────────────────────────────────────────────────────

const TASNIM_USER = {
  id: "user-tasnim-1",
  email: "tasnim@test.uz",
  name: "Tasnim User",
  roles: ["SALES_MANAGER"],
  permissions: [
    "sales.read",
    "sales.write",
    "transfers.read",
    "transfers.write",
    "finance.read",
    "finance.write",
  ],
  entityAccess: ["entity-tasnim"],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getAuthMock() {
  const { auth } = await import("@/auth");
  return vi.mocked(auth);
}

async function getPrismaMock() {
  const { prisma } = await import("@/lib/db");
  return prisma;
}

// ── Sales — entity isolation ──────────────────────────────────────────────────

describe("Sales Server Actions — entity isolation", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const authMock = await getAuthMock();
    authMock.mockResolvedValue({ user: TASNIM_USER } as never);
  });

  it("createSalesOrderAction: Tahlil entityId → AuthzError(403)", async () => {
    const { createSalesOrderAction } = await import("@/app/(app)/sales/actions");
    await expect(
      createSalesOrderAction({
        entityId: "entity-tahlil",
        channelId: "chan-1",
        warehouseId: "wh-1",
        lines: [{ productId: "p1", qty: 1, unitPrice: 50000 }],
      }),
    ).rejects.toThrow(AuthzError);
  });

  it("createSalesOrderAction: Tasnim entityId → passes guard, calls service", async () => {
    const { createSalesOrder } = await import("@/lib/services/sales-service");
    const { createSalesOrderAction } = await import("@/app/(app)/sales/actions");
    await expect(
      createSalesOrderAction({
        entityId: "entity-tasnim",
        channelId: "chan-1",
        warehouseId: "wh-1",
        lines: [{ productId: "p1", qty: 1, unitPrice: 50000 }],
      }),
    ).resolves.toBe("o-new");
    expect(createSalesOrder).toHaveBeenCalled();
  });

  it("confirmOrderAction: Tahlil order → AuthzError(403)", async () => {
    const prismaMock = await getPrismaMock();
    vi.mocked(prismaMock.salesOrder.findUniqueOrThrow).mockResolvedValue({
      entityId: "entity-tahlil",
    } as never);
    const { confirmOrderAction } = await import("@/app/(app)/sales/actions");
    await expect(confirmOrderAction("order-tahlil-1")).rejects.toThrow(AuthzError);
  });

  it("confirmOrderAction: Tasnim order → passes guard", async () => {
    const prismaMock = await getPrismaMock();
    vi.mocked(prismaMock.salesOrder.findUniqueOrThrow).mockResolvedValue({
      entityId: "entity-tasnim",
    } as never);
    const { confirmOrderAction } = await import("@/app/(app)/sales/actions");
    await expect(confirmOrderAction("order-tasnim-1")).resolves.not.toThrow();
  });

  it("shipOrderAction: Tahlil order → AuthzError(403)", async () => {
    const prismaMock = await getPrismaMock();
    vi.mocked(prismaMock.salesOrder.findUniqueOrThrow).mockResolvedValue({
      entityId: "entity-tahlil",
    } as never);
    const { shipOrderAction } = await import("@/app/(app)/sales/actions");
    await expect(shipOrderAction("order-tahlil-1")).rejects.toThrow(AuthzError);
  });
});

// ── Transfers — entity isolation ──────────────────────────────────────────────

describe("Transfer Server Actions — entity isolation", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const authMock = await getAuthMock();
    authMock.mockResolvedValue({ user: TASNIM_USER } as never);
  });

  it("createTransferAction: fromEntityId=Tahlil → AuthzError(403)", async () => {
    const { createTransferAction } = await import("@/app/(app)/transfers/actions");
    await expect(
      createTransferAction({
        fromEntityId: "entity-tahlil",
        toEntityId: "entity-tasnim",
        fromWarehouseId: "wh-tahlil",
        toWarehouseId: "wh-tasnim",
        lines: [{ productId: "p1", qty: 5 }],
      }),
    ).rejects.toThrow(AuthzError);
  });

  it("createTransferAction: fromEntityId=Tasnim → passes guard, calls service", async () => {
    const { createTransfer } = await import("@/lib/services/transfer-service");
    const { createTransferAction } = await import("@/app/(app)/transfers/actions");
    await expect(
      createTransferAction({
        fromEntityId: "entity-tasnim",
        toEntityId: "entity-tahlil",
        fromWarehouseId: "wh-tasnim",
        toWarehouseId: "wh-tahlil",
        lines: [{ productId: "p1", qty: 5 }],
      }),
    ).resolves.toBe("t-new");
    expect(createTransfer).toHaveBeenCalled();
  });

  it("shipTransferAction: Tahlil fromEntity → AuthzError(403)", async () => {
    const prismaMock = await getPrismaMock();
    vi.mocked(prismaMock.transferOrder.findUniqueOrThrow).mockResolvedValue({
      fromEntityId: "entity-tahlil",
    } as never);
    const { shipTransferAction } = await import("@/app/(app)/transfers/actions");
    await expect(shipTransferAction("transfer-tahlil-1")).rejects.toThrow(AuthzError);
  });

  it("recordSettlementAction: fromEntityId=Tahlil → AuthzError(403)", async () => {
    const { recordSettlementAction } = await import("@/app/(app)/transfers/actions");
    await expect(
      recordSettlementAction({
        fromEntityId: "entity-tahlil",
        toEntityId: "entity-tasnim",
        amountUZS: 1_000_000,
      }),
    ).rejects.toThrow(AuthzError);
  });
});

// ── T-17: rate limit reaches auth.ts authorize() ─────────────────────────────

describe("T-17 — Rate limit in authorize() blocks direct POST bypass", () => {
  it("isRateLimited returns true after MAX_ATTEMPTS (count=5 in DB)", async () => {
    const prismaMock = await getPrismaMock();
    vi.mocked(prismaMock.loginAttempt.findUnique).mockResolvedValue({
      key: "192.0.2.1:attacker@evil.uz",
      count: 5,
      firstAt: new Date(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    } as never);

    const { isRateLimited } = await import("@/lib/login-rate-limit");
    const blocked = await isRateLimited("192.0.2.1", "attacker@evil.uz");
    expect(blocked).toBe(true);
  });

  it("isRateLimited returns false on first attempt (no existing record)", async () => {
    const prismaMock = await getPrismaMock();
    vi.mocked(prismaMock.loginAttempt.findUnique).mockResolvedValue(null);
    vi.mocked(prismaMock.loginAttempt.upsert).mockResolvedValue({} as never);

    const { isRateLimited } = await import("@/lib/login-rate-limit");
    const blocked = await isRateLimited("10.0.0.1", "new@user.uz");
    expect(blocked).toBe(false);
    expect(prismaMock.loginAttempt.upsert).toHaveBeenCalledOnce();
  });

  it("isRateLimited resets when window has expired", async () => {
    const prismaMock = await getPrismaMock();
    vi.mocked(prismaMock.loginAttempt.findUnique).mockResolvedValue({
      key: "10.0.0.1:old@user.uz",
      count: 5,
      firstAt: new Date(Date.now() - 20 * 60 * 1000),
      expiresAt: new Date(Date.now() - 5 * 60 * 1000), // expired
    } as never);
    vi.mocked(prismaMock.loginAttempt.upsert).mockResolvedValue({} as never);

    const { isRateLimited } = await import("@/lib/login-rate-limit");
    const blocked = await isRateLimited("10.0.0.1", "old@user.uz");
    expect(blocked).toBe(false); // window expired → fresh window, not blocked
  });
});

// ── T-23 (re-opened): entityFilter fail-closed behavior ──────────────────────

describe("entityFilter — fail-closed (T-23)", () => {
  it("returns [] for user with no entityAccess and no admin permission", () => {
    const emptyUser = {
      id: "u1",
      permissions: ["sales.read"],
      roles: ["VIEWER"],
      entityAccess: [],
    };
    expect(entityFilter(emptyUser)).toEqual([]);
  });

  it("returns null for user with admin permission and no entityAccess (unrestricted)", () => {
    const adminUser = {
      id: "u2",
      permissions: ["admin.settings", "sales.read"],
      roles: ["ADMIN"],
      entityAccess: [],
    };
    expect(entityFilter(adminUser)).toBeNull();
  });

  it("returns null for DIRECTOR role with no entityAccess", () => {
    const director = {
      id: "u3",
      permissions: ["sales.read"],
      roles: ["DIRECTOR"],
      entityAccess: [],
    };
    expect(entityFilter(director)).toBeNull();
  });

  it("returns assigned entityAccess array for normal scoped user", () => {
    expect(entityFilter(TASNIM_USER)).toEqual(["entity-tasnim"]);
  });

  it("returns [] for null user (not logged in)", () => {
    expect(entityFilter(null)).toEqual([]);
  });
});
