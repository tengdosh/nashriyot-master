"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeft, PanelLeftClose } from "lucide-react";
import { NAV_ITEMS, filterNav } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function Sidebar({ permissions }: { permissions: string[] }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);
  const items = filterNav(NAV_ITEMS, permissions);

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div className="flex h-14 items-center gap-2 px-3">
        <span aria-hidden className="inline-block size-7 shrink-0 rounded-md bg-sidebar-primary" />
        {!collapsed && <span className="truncate font-semibold">Nashriyot-Master</span>}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-2">
        <ul className="flex flex-col gap-0.5">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={item.label}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                    active
                      ? "bg-sidebar-primary font-medium text-sidebar-primary-foreground"
                      : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    collapsed && "justify-center",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center gap-2 border-t px-3.5 py-2.5 text-sm text-muted-foreground hover:text-foreground"
      >
        {collapsed ? (
          <PanelLeft className="size-4" />
        ) : (
          <>
            <PanelLeftClose className="size-4" /> Yigʻish
          </>
        )}
      </button>
    </aside>
  );
}
