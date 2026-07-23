import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { ScenarioEditor } from "../scenario-editor";

export const metadata = { title: "Yangi ssenariy" };

export default async function NewScenarioPage() {
  const user = await requirePermission("acquisitions.write");
  const titles = await prisma.title.findMany({
    where: { archivedAt: null, OR: [{ entityId: { in: user.entityAccess } }, { entityId: null }] },
    select: { id: true, workTitle: true },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  return <ScenarioEditor titles={titles} existing={null} />;
}
