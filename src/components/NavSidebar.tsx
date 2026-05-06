"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Hammer,
  Users,
  HardHat,
  Wrench,
  ArrowLeftRight,
  Calendar,
  CheckSquare,
  ShoppingCart,
  Banknote,
  Truck,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";

const items = [
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/chantiers", label: "Chantiers", icon: Hammer },
  { href: "/equipes", label: "Équipes", icon: Users },
  { href: "/ouvriers", label: "Ouvriers", icon: HardHat },
  { href: "/materiel", label: "Matériel", icon: Wrench },
  { href: "/sorties", label: "Sorties / Retours", icon: ArrowLeftRight },
  { href: "/locations", label: "Locations / Prêts", icon: Truck },
  { href: "/commandes", label: "Commandes", icon: ShoppingCart },
  { href: "/pointage", label: "Pointage", icon: CheckSquare },
  { href: "/paie", label: "Paie", icon: Banknote },
  { href: "/planning", label: "Planning", icon: Calendar },
];

const mobileItems = [
  { href: "/dashboard", label: "Accueil", icon: LayoutDashboard },
  { href: "/pointage", label: "Pointage", icon: CheckSquare },
  { href: "/sorties", label: "Sorties", icon: ArrowLeftRight },
  { href: "/chantiers", label: "Chantiers", icon: Hammer },
  { href: "/materiel", label: "Matériel", icon: Wrench },
];

function BrandHeader({ subtitle }: { subtitle?: string }) {
  return (
    <Link href="/dashboard" className="flex items-center gap-3 min-w-0">
      <Image
        src="/brand/logo-icon.webp"
        alt="Autonhome"
        width={36}
        height={36}
        className="rounded-md object-contain shrink-0 bg-white"
      />
      <div className="min-w-0">
        <div className="font-bold text-brand-700 dark:text-brand-700 leading-tight">Autonhome</div>
        {subtitle && (
          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{subtitle}</div>
        )}
      </div>
    </Link>
  );
}

export function DesktopSidebar({
  userName,
  signOutAction,
}: {
  userName: string;
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-60 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <div className="px-4 py-4 border-b border-slate-200 dark:border-slate-800">
        <BrandHeader subtitle={userName} />
      </div>
      <nav className="flex-1 overflow-y-auto py-3">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname?.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-5 py-2.5 text-sm transition-colors",
                active
                  ? "bg-brand-50 text-brand-700 dark:bg-brand-200/30 dark:text-brand-700 font-medium border-r-2 border-brand-500"
                  : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              )}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-slate-200 dark:border-slate-800 p-3 space-y-2">
        <div className="flex justify-center">
          <ThemeToggle />
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md"
          >
            <LogOut size={16} />
            Se déconnecter
          </button>
        </form>
      </div>
    </aside>
  );
}

export function MobileBottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 grid grid-cols-5"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {mobileItems.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname?.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-col items-center justify-center py-2 gap-0.5 text-[10px]",
              active ? "text-brand-700" : "text-slate-600 dark:text-slate-400"
            )}
          >
            <Icon size={20} />
            <span className="truncate max-w-full px-1">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileTopBar({
  userName,
  signOutAction,
}: {
  userName: string;
  signOutAction: () => Promise<void>;
}) {
  return (
    <header className="md:hidden sticky top-0 z-30 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 py-2 flex items-center justify-between gap-2">
      <BrandHeader subtitle={userName} />
      <div className="flex items-center gap-1">
        <ThemeToggle compact />
        <form action={signOutAction}>
          <button type="submit" className="text-slate-500 dark:text-slate-400 p-2" aria-label="Se déconnecter">
            <LogOut size={18} />
          </button>
        </form>
      </div>
    </header>
  );
}
