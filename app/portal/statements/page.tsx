import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { portalStatements, signReportToken } from "@/lib/services/portal-service";
import { StatementsList, type StatementCard } from "./statements-list";

export const metadata = { title: "Hisobotlar" };

export default async function PortalStatementsPage() {
  const session = await auth();
  const contributorId = session?.user?.contributorId;
  if (!contributorId) redirect("/login?error=no-contributor");

  const statements = await portalStatements(contributorId);

  // Each download link carries a short-lived signed token bound to this author.
  const cards: StatementCard[] = statements.map((s) => ({
    ...s,
    downloadToken: signReportToken(s.id, contributorId),
  }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hisobotlar</h1>
        <p className="text-sm text-muted-foreground">
          Yuborilgan royalti davrlari. Har bir hisobotni imzolangan (vaqtincha) havola orqali yuklab
          olishingiz mumkin.
        </p>
      </div>
      <StatementsList cards={cards} />
    </div>
  );
}
