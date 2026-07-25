import { Prisma, type ContractStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runWithAudit } from "@/lib/audit-context";
import { assertValidTiers, validateTiers, describeTierProblem, type TierInput } from "@/lib/royalty";
import type { ContractCreateInput, ContractUpdateInput } from "@/lib/validators/contract";

export class ContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractError";
  }
}

/** Status machine: DRAFT → ACTIVE → CLOSED. Only ACTIVE contracts are run. */
export const CONTRACT_FLOW: Record<ContractStatus, ContractStatus[]> = {
  DRAFT: ["ACTIVE"],
  ACTIVE: ["CLOSED"],
  CLOSED: [],
};

export function canContractTransition(from: ContractStatus, to: ContractStatus): boolean {
  return CONTRACT_FLOW[from]?.includes(to) ?? false;
}

function toTierInputs(
  tiers: { format?: string | null; fromUnits: number; toUnits?: number | null; rate: number; basis?: string }[],
): TierInput[] {
  return tiers.map((t) => ({
    format: t.format ?? null,
    fromUnits: t.fromUnits,
    toUnits: t.toUnits ?? null,
    rate: t.rate,
    basis: (t.basis as "LIST" | "NET") ?? "LIST",
  }));
}

/** Surfaces every tier problem at once so the editor can highlight them all. */
export function checkTiers(tiers: Parameters<typeof toTierInputs>[0]): string[] {
  return validateTiers(toTierInputs(tiers)).map(describeTierProblem);
}

export async function createContract(input: ContractCreateInput, userId: string) {
  if (input.type === "ROYALTY") assertValidTiers(toTierInputs(input.tiers));

  return runWithAudit({ userId }, async () =>
    prisma.contract.create({
      data: {
        contributorId: input.contributorId,
        titleId: input.titleId,
        type: input.type,
        advanceAmount: new Prisma.Decimal(input.advanceAmount),
        reserveRate: new Prisma.Decimal(input.reserveRate),
        buyoutAmount: input.buyoutAmount != null ? new Prisma.Decimal(input.buyoutAmount) : null,
        audioRights: input.audioRights,
        status: "DRAFT",
        tiers: {
          create: input.tiers.map((t) => ({
            format: t.format ?? null,
            fromUnits: t.fromUnits,
            toUnits: t.toUnits ?? null,
            rate: new Prisma.Decimal(t.rate),
            basis: t.basis,
          })),
        },
      },
      include: { tiers: { orderBy: { fromUnits: "asc" } } },
    }),
  );
}

/**
 * Edit a DRAFT contract. An ACTIVE contract's tiers are frozen: a statement has
 * possibly already been issued against them, and re-rating history would break
 * the determinism guarantee (spec §6.5).
 */
export async function updateContract(input: ContractUpdateInput, userId: string) {
  const existing = await prisma.contract.findUniqueOrThrow({
    where: { id: input.id },
    include: { statements: { select: { id: true } } },
  });
  if (input.tiers && existing.status !== "DRAFT") {
    throw new ContractError(
      "Faol shartnomaning tier jadvali oʻzgartirilmaydi — hisobotlar shu jadval boʻyicha berilgan",
    );
  }
  if (input.tiers) assertValidTiers(toTierInputs(input.tiers));
  if (existing.statements.length > 0 && input.advanceAmount != null) {
    throw new ContractError("Hisobot berilgandan keyin avans summasi oʻzgartirilmaydi");
  }

  return runWithAudit({ userId }, async () =>
    prisma.$transaction(async (tx) => {
      if (input.tiers) {
        await tx.royaltyTier.deleteMany({ where: { contractId: input.id } });
        for (const t of input.tiers) {
          await tx.royaltyTier.create({
            data: {
              contractId: input.id,
              format: t.format ?? null,
              fromUnits: t.fromUnits,
              toUnits: t.toUnits ?? null,
              rate: new Prisma.Decimal(t.rate),
              basis: t.basis,
            },
          });
        }
      }
      return tx.contract.update({
        where: { id: input.id },
        data: {
          ...(input.advanceAmount != null ? { advanceAmount: new Prisma.Decimal(input.advanceAmount) } : {}),
          ...(input.reserveRate != null ? { reserveRate: new Prisma.Decimal(input.reserveRate) } : {}),
          ...(input.buyoutAmount !== undefined
            ? { buyoutAmount: input.buyoutAmount != null ? new Prisma.Decimal(input.buyoutAmount) : null }
            : {}),
          ...(input.audioRights != null ? { audioRights: input.audioRights } : {}),
        },
        include: { tiers: { orderBy: { fromUnits: "asc" } } },
      });
    }),
  );
}

/**
 * Activate a contract.
 *
 * A BUYOUT contract has NO royalty engine (v2 §6 M7): the one-time fee becomes a
 * TITLE-scope `MUALLIF_BUYOUT` cost entry, which is exactly where M3's
 * `uniquePerCopy` picks it up. It is written once — `contractId` on the entry
 * makes re-activation idempotent instead of doubling the author cost.
 *
 * A ROYALTY contract must have a valid tier ladder before it can go live.
 */
export async function activateContract(contractId: string, userId: string) {
  const c = await prisma.contract.findUniqueOrThrow({
    where: { id: contractId },
    include: { tiers: true, title: { select: { entityId: true } } },
  });
  if (!canContractTransition(c.status, "ACTIVE")) {
    throw new ContractError(`Holat oʻtishi taqiqlangan: ${c.status} → ACTIVE`);
  }

  if (c.type === "ROYALTY") {
    if (c.tiers.length === 0) throw new ContractError("ROYALTY shartnomada tier jadvali boʻsh");
    assertValidTiers(
      c.tiers.map((t) => ({
        id: t.id,
        format: t.format,
        fromUnits: t.fromUnits,
        toUnits: t.toUnits,
        rate: new Prisma.Decimal(t.rate),
        basis: t.basis,
      })),
    );
  } else if (!c.buyoutAmount || new Prisma.Decimal(c.buyoutAmount).lte(0)) {
    throw new ContractError("BUYOUT shartnomada buyoutAmount majburiy");
  }

  return runWithAudit({ userId }, async () =>
    prisma.$transaction(async (tx) => {
      if (c.type === "BUYOUT") {
        const already = await tx.costEntry.findFirst({ where: { contractId: c.id } });
        if (!already) {
          const amount = new Prisma.Decimal(c.buyoutAmount!);
          await tx.costEntry.create({
            data: {
              scope: "TITLE",
              category: "MUALLIF_BUYOUT",
              titleId: c.titleId,
              entityId: c.title?.entityId ?? null,
              contractId: c.id,
              amount,
              currency: "UZS",
              rate: new Prisma.Decimal(1),
              amountUZS: amount,
              date: new Date(),
            },
          });
        }
      }
      return tx.contract.update({ where: { id: c.id }, data: { status: "ACTIVE" } });
    }),
  );
}

export async function closeContract(contractId: string, userId: string) {
  const c = await prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
  if (!canContractTransition(c.status, "CLOSED")) {
    throw new ContractError(`Holat oʻtishi taqiqlangan: ${c.status} → CLOSED`);
  }
  return runWithAudit({ userId }, async () =>
    prisma.contract.update({ where: { id: contractId }, data: { status: "CLOSED" } }),
  );
}

/**
 * Advance still to be earned back = advance − everything already recouped on
 * SEALED statements. Derived rather than stored so it can never drift out of
 * sync with the statements an author has actually been sent.
 */
export async function advanceOutstanding(contractId: string): Promise<Prisma.Decimal> {
  const c = await prisma.contract.findUniqueOrThrow({
    where: { id: contractId },
    select: { advanceAmount: true },
  });
  const agg = await prisma.royaltyStatement.aggregate({
    where: { contractId, run: { status: { in: ["APPROVED", "SENT"] } } },
    _sum: { advanceRecouped: true },
  });
  const recouped = new Prisma.Decimal(agg._sum.advanceRecouped ?? 0);
  return Prisma.Decimal.max(new Prisma.Decimal(c.advanceAmount).minus(recouped), 0);
}

export async function listContracts() {
  const contracts = await prisma.contract.findMany({
    where: { archivedAt: null },
    include: {
      contributor: { select: { fullName: true, role: true } },
      title: { select: { workTitle: true } },
      tiers: { orderBy: { fromUnits: "asc" } },
      statements: { select: { id: true, payable: true, advanceRecouped: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return Promise.all(
    contracts.map(async (c) => ({
      contract: c,
      advanceOutstanding: await advanceOutstanding(c.id),
      tierProblems: c.type === "ROYALTY" ? checkTiers(
        c.tiers.map((t) => ({
          format: t.format,
          fromUnits: t.fromUnits,
          toUnits: t.toUnits,
          rate: Number(t.rate),
          basis: t.basis,
        })),
      ) : [],
    })),
  );
}

export async function getContract(contractId: string) {
  return prisma.contract.findUniqueOrThrow({
    where: { id: contractId },
    include: {
      contributor: true,
      title: { select: { id: true, workTitle: true, products: { select: { format: true, listPrice: true } } } },
      tiers: { orderBy: { fromUnits: "asc" } },
      statements: { include: { run: true }, orderBy: { createdAt: "desc" } },
      costEntries: true,
    },
  });
}
