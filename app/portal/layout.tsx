import { redirect } from "next/navigation";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { auth } from "@/auth";
import { PortalNav } from "./portal-nav";

/**
 * Author portal shell — deliberately separate from the admin app layout: no
 * module sidebar, no entity switcher. Middleware already restricts /portal to
 * the AUTHOR role; here we additionally require a linked contributorId, since
 * every portal query is scoped by it.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.user.contributorId) redirect("/login?error=no-contributor");

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/portal" className="flex items-center gap-2 font-semibold">
            <BookOpen className="size-5 text-primary" />
            Muallif portali
          </Link>
          <PortalNav name={session.user.name ?? "Muallif"} />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
