import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { portalBooks } from "@/lib/services/portal-service";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatNumber } from "@/lib/format";

export const metadata = { title: "Kitoblarim" };

const ROLE_LABELS: Record<string, string> = {
  AUTHOR: "Muallif",
  CO_AUTHOR: "Hammuallif",
  TRANSLATOR: "Tarjimon",
  EDITOR: "Muharrir",
  ILLUSTRATOR: "Rassom",
  DESIGNER: "Dizayner",
  NARRATOR: "Diktor",
  OTHER: "Boshqa",
};

export default async function PortalBooksPage() {
  const session = await auth();
  const contributorId = session?.user?.contributorId;
  if (!contributorId) redirect("/login?error=no-contributor");

  const books = await portalBooks(contributorId);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Kitoblarim</h1>
        <p className="text-sm text-muted-foreground">
          Siz hissa qoʻshgan asarlar. Sotuv raqamlari faqat yuborilgan davrlardan.
        </p>
      </div>

      {books.length === 0 ? (
        <div className="rounded-lg border bg-background py-12 text-center text-sm text-muted-foreground">
          Sizga bogʻlangan asar yoʻq.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {books.map((b) => (
            <div key={`${b.titleId}-${b.role}`} className="rounded-lg border bg-background p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{b.workTitle}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <StatusBadge status={b.role} tone="info" label={ROLE_LABELS[b.role] ?? b.role} />
                    {b.shareRate != null && <span>{(b.shareRate * 100).toFixed(0)}% ulush</span>}
                    {b.contractType && (
                      <span>{b.contractType === "ROYALTY" ? "Royalti shartnoma" : "Bir martalik"}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-3 text-sm">
                <span className="text-muted-foreground">Jami sof nusxa: </span>
                <span className="font-medium tabular-nums">{formatNumber(b.lifetimeNetUnits)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
