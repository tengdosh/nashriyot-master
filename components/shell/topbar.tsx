"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Bell, Check, ChevronDown, LogOut, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type EntityOpt = { id: string; code: string; name: string };

export function Topbar({
  user,
  entities,
}: {
  user: { name?: string | null; email?: string | null };
  entities: EntityOpt[];
}) {
  const pathname = usePathname();
  const [entity, setEntity] = React.useState(entities[0]?.id);
  const crumbs = pathname.split("/").filter(Boolean);
  const initials = (user.name ?? user.email ?? "?").slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
      <nav aria-label="breadcrumb" className="text-sm text-muted-foreground">
        {crumbs.length === 0 ? (
          "Boshqaruv paneli"
        ) : (
          crumbs.map((c, i) => (
            <span key={`${c}-${i}`}>
              {i > 0 && <span className="mx-1.5 text-muted-foreground/50">/</span>}
              <span className={cn(i === crumbs.length - 1 && "text-foreground")}>{c}</span>
            </span>
          ))
        )}
      </nav>

      {/* ⌘K global search skeleton (wired in M2) */}
      <button
        type="button"
        className="ml-4 hidden h-8 w-64 items-center gap-2 rounded-md border bg-muted/40 px-2.5 text-sm text-muted-foreground sm:flex"
      >
        <Search className="size-4" /> Qidirish…
        <kbd className="ml-auto rounded bg-background px-1.5 py-0.5 text-xs">⌘K</kbd>
      </button>

      <div className="ml-auto flex items-center gap-2">
        {entities.length > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
              {entities.find((e) => e.id === entity)?.code ?? "Subʼekt"}
              <ChevronDown className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Subʼekt</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {entities.map((e) => (
                <DropdownMenuItem key={e.id} onClick={() => setEntity(e.id)}>
                  <Check className={cn("size-4", e.id !== entity && "opacity-0")} />
                  {e.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <Button variant="ghost" size="icon" aria-label="Bildirishnomalar">
          <Bell className="size-4" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted"
              />
            }
          >
            <Avatar className="size-7">
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <ChevronDown className="size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>
              <div className="font-medium">{user.name}</div>
              <div className="text-xs font-normal text-muted-foreground">{user.email}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => signOut({ callbackUrl: "/login" })}>
              <LogOut className="size-4" /> Chiqish
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
