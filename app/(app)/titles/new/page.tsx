import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { TitleWizard } from "./title-wizard";

export const metadata = { title: "Yangi asar" };

export default async function NewTitlePage() {
  const user = await requirePermission("titles.write");

  const [entities, extPublishers, series] = await Promise.all([
    prisma.entity.findMany({
      where: { id: { in: user.entityAccess }, type: "PUBLISHER" },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
    prisma.partner.findMany({
      where: { roles: { has: "EXT_PUBLISHER" }, isBlocked: false, archivedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.series.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return <TitleWizard entities={entities} extPublishers={extPublishers} series={series} />;
}
