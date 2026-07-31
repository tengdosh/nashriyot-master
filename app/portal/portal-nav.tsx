"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/portal", label: "Umumiy" },
  { href: "/portal/statements", label: "Hisobotlar" },
  { href: "/portal/books", label: "Kitoblarim" },
];

export function PortalNav({ name }: { name: string }) {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1">
      <nav className="flex items-center gap-1">
        {LINKS.map((l) => {
          const active = l.href === "/portal" ? pathname === "/portal" : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
      <span className="ml-2 hidden text-sm text-muted-foreground sm:inline">{name}</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => signOut({ callbackUrl: "/nashriyot-master/login" })}
        aria-label="Chiqish"
      >
        <LogOut className="size-4" />
      </Button>
    </div>
  );
}
