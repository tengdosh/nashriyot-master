import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  BookText,
  Calculator,
  Factory,
  Warehouse,
  ShoppingCart,
  ArrowLeftRight,
  LineChart,
  Crown,
  Users,
  Wallet,
  BarChart3,
  Sparkles,
  Settings,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  permission: string;
};

/** Module navigation. The sidebar filters this by the user's permissions. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Boshqaruv paneli", icon: LayoutDashboard, permission: "dashboard.read" },
  { href: "/titles", label: "Sarlavhalar", icon: BookText, permission: "titles.read" },
  { href: "/acquisitions", label: "Akvizitsiya", icon: Calculator, permission: "acquisitions.read" },
  { href: "/production", label: "Ishlab chiqarish", icon: Factory, permission: "production.read" },
  { href: "/inventory", label: "Ombor", icon: Warehouse, permission: "inventory.read" },
  { href: "/sales", label: "Sotuv", icon: ShoppingCart, permission: "sales.read" },
  { href: "/transfers", label: "Transferlar", icon: ArrowLeftRight, permission: "transfers.read" },
  { href: "/costing", label: "Tan narx", icon: LineChart, permission: "costing.read" },
  { href: "/royalties", label: "Royalti", icon: Crown, permission: "royalty.read" },
  { href: "/leads", label: "Lidlar", icon: Users, permission: "leads.read" },
  { href: "/finance", label: "Moliya", icon: Wallet, permission: "finance.read" },
  { href: "/analytics", label: "Analitika", icon: BarChart3, permission: "analytics.read" },
  { href: "/ai", label: "AI Studio", icon: Sparkles, permission: "ai.read" },
  { href: "/admin", label: "Administratsiya", icon: Settings, permission: "admin.users" },
];

/** Keep only the modules the user's permission set unlocks. */
export function filterNav(items: NavItem[], permissions: string[] | undefined): NavItem[] {
  const set = new Set(permissions ?? []);
  return items.filter((i) => set.has(i.permission));
}
