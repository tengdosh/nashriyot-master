import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { QuickForm } from "./quick-form";

type QuickType = "sale" | "payment" | "expense" | "transfer";

const TYPE_LABELS: Record<QuickType, string> = {
  sale: "Tez sotuv",
  payment: "Tez to'lov",
  expense: "Tez xarajat",
  transfer: "Tez transfer",
};

const VALID_TYPES = new Set<string>(["sale", "payment", "expense", "transfer"]);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ type: string }>;
}): Promise<Metadata> {
  const { type } = await params;
  const label = TYPE_LABELS[type as QuickType] ?? "Tez kiritish";
  return { title: `${label} — Nashriyot Master` };
}

export default async function QuickPage({ params }: { params: Promise<{ type: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { type } = await params;
  if (!VALID_TYPES.has(type)) redirect("/dashboard");

  const qtype = type as QuickType;

  // Kerakli ma'lumotlarni parallel yuklash
  const [products, warehouses, channels, entities] = await Promise.all([
    // Mahsulotlar — faqat sale va transfer uchun
    qtype === "sale" || qtype === "transfer"
      ? prisma.product.findMany({
          where: { archivedAt: null },
          select: { id: true, sku: true, title: { select: { workTitle: true } } },
          orderBy: { title: { workTitle: "asc" } },
          take: 500,
        })
      : Promise.resolve([]),

    // Omborlar — sale va transfer uchun
    qtype === "sale" || qtype === "transfer"
      ? prisma.warehouse.findMany({
          where: { archivedAt: null },
          select: { id: true, name: true, entityId: true, type: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),

    // Kanallar — faqat sale uchun
    qtype === "sale"
      ? prisma.salesChannel.findMany({
          where: { archivedAt: null },
          select: { id: true, name: true, type: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),

    // Sub'ektlar — hamma turdagi formalar uchun
    prisma.entity.findMany({
      where: {
        archivedAt: null,
        // Foydalanuvchi faqat o'z sub'ektlariga kirishi mumkin
        ...(session.user.entityAccess?.length
          ? { id: { in: session.user.entityAccess } }
          : {}),
      },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
  ]);

  const label = TYPE_LABELS[qtype];

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{label}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Mobil tez kiritish — ma&apos;lumot darhol saqlanadi
        </p>
      </div>

      <QuickForm
        type={qtype}
        products={products.map((p) => ({
          id: p.id,
          label: `${p.title.workTitle} (${p.sku})`,
        }))}
        warehouses={warehouses.map((w) => ({
          id: w.id,
          name: w.name,
          entityId: w.entityId,
          type: w.type,
        }))}
        channels={channels.map((c) => ({ id: c.id, name: c.name }))}
        entities={entities.map((e) => ({ id: e.id, name: `${e.code} — ${e.name}` }))}
      />
    </div>
  );
}
