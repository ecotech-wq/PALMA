"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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
  ShieldCheck,
  UserCircle,
  Menu,
  X,
  Settings,
  FileText,
  AlertTriangle,
  Package,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
  clientHidden?: boolean;
};

type NavGroup = {
  key: string;
  label: string;
  icon: typeof LayoutDashboard;
  items: NavItem[];
  /** Cache tout le groupe pour le rôle CLIENT */
  clientHidden?: boolean;
  adminOnly?: boolean;
};

// Item solo (Tableau de bord = toujours en haut, jamais dans un groupe)
const dashboardItem: NavItem = {
  href: "/dashboard",
  label: "Tableau de bord",
  icon: LayoutDashboard,
};

// Groupes thématiques pour la sidebar — repliables, pré-ouverts si on est dedans
const groups: NavGroup[] = [
  {
    key: "chantiers",
    label: "Chantiers & équipes",
    icon: Hammer,
    items: [
      { href: "/chantiers", label: "Chantiers", icon: Hammer },
      { href: "/equipes", label: "Équipes", icon: Users, clientHidden: true },
      { href: "/ouvriers", label: "Ouvriers", icon: HardHat, clientHidden: true },
      { href: "/planning", label: "Planning", icon: Calendar, clientHidden: true },
    ],
  },
  {
    key: "terrain",
    label: "Suivi terrain",
    icon: FileText,
    items: [
      { href: "/pointage", label: "Pointage", icon: CheckSquare, clientHidden: true },
      { href: "/rapports", label: "Rapports", icon: FileText },
      { href: "/incidents", label: "Incidents", icon: AlertTriangle },
    ],
  },
  {
    key: "materiel",
    label: "Matériel & achats",
    icon: Wrench,
    clientHidden: true,
    items: [
      { href: "/materiel", label: "Matériel", icon: Wrench },
      { href: "/sorties", label: "Sorties / Retours", icon: ArrowLeftRight },
      { href: "/locations", label: "Locations / Prêts", icon: Truck },
      { href: "/commandes", label: "Commandes", icon: ShoppingCart },
      { href: "/demandes", label: "Demandes matériel", icon: Package },
    ],
  },
  {
    key: "finance",
    label: "Finances",
    icon: Banknote,
    adminOnly: true,
    items: [{ href: "/paie", label: "Paie", icon: Banknote }],
  },
];

// Barre de tab mobile, variante par rôle
const mobilePrimaryAdmin: NavItem[] = [
  { href: "/dashboard", label: "Accueil", icon: LayoutDashboard },
  { href: "/pointage", label: "Pointage", icon: CheckSquare },
  { href: "/paie", label: "Paie", icon: Banknote, adminOnly: true },
  { href: "/ouvriers", label: "Ouvriers", icon: HardHat },
];
const mobilePrimaryChef: NavItem[] = [
  { href: "/dashboard", label: "Accueil", icon: LayoutDashboard },
  { href: "/pointage", label: "Pointage", icon: CheckSquare },
  { href: "/chantiers", label: "Chantiers", icon: Hammer },
  { href: "/ouvriers", label: "Ouvriers", icon: HardHat },
];
const mobilePrimaryClient: NavItem[] = [
  { href: "/dashboard", label: "Accueil", icon: LayoutDashboard },
  { href: "/chantiers", label: "Chantiers", icon: Hammer },
  { href: "/rapports", label: "Rapports", icon: FileText },
  { href: "/incidents", label: "Incidents", icon: AlertTriangle },
];

// Tout le reste, accessible via le bouton "Plus"
const mobileMore: NavItem[] = [
  { href: "/chantiers", label: "Chantiers", icon: Hammer },
  { href: "/equipes", label: "Équipes", icon: Users, clientHidden: true },
  { href: "/materiel", label: "Matériel", icon: Wrench, clientHidden: true },
  { href: "/sorties", label: "Sorties / Retours", icon: ArrowLeftRight, clientHidden: true },
  { href: "/locations", label: "Locations / Prêts", icon: Truck, clientHidden: true },
  { href: "/commandes", label: "Commandes", icon: ShoppingCart, clientHidden: true },
  { href: "/planning", label: "Planning", icon: Calendar, clientHidden: true },
  { href: "/rapports", label: "Rapports", icon: FileText },
  { href: "/incidents", label: "Incidents", icon: AlertTriangle },
  { href: "/demandes", label: "Demandes matériel", icon: Package, clientHidden: true },
  { href: "/profil", label: "Mon profil", icon: UserCircle },
];

function BrandHeader({
  subtitle,
  href = "/dashboard",
}: {
  subtitle?: string;
  href?: string;
}) {
  return (
    <Link href={href} className="flex items-center gap-3 min-w-0">
      <Image
        src="/brand/logo-icon.webp"
        alt="Autonhome"
        width={36}
        height={36}
        className="rounded-md object-contain shrink-0 bg-white"
      />
      <div className="min-w-0">
        <div className="font-bold text-brand-700 dark:text-brand-700 leading-tight">
          Autonhome
        </div>
        {subtitle && (
          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {subtitle}
          </div>
        )}
      </div>
    </Link>
  );
}

export type NavBadges = {
  paie?: number;
  locations?: number;
  sorties?: number;
  incidents?: number;
  demandes?: number;
  adminUsers?: number;
};

export type ClientVisibility = {
  showJournal: boolean;
  showIncidents: boolean;
  showPlans: boolean;
  showRapportsHebdo: boolean;
};

/** Filtre les NavItem selon la visibilité du client (rôle CLIENT). */
function applyClientVisibility(
  item: NavItem,
  vis?: ClientVisibility
): boolean {
  if (!vis) return true;
  if (item.href === "/rapports" && !vis.showJournal) return false;
  if (item.href === "/incidents" && !vis.showIncidents) return false;
  return true;
}

function NavBadge({
  count,
  variant = "warning",
}: {
  count: number;
  variant?: "warning" | "danger" | "info";
}) {
  if (count <= 0) return null;
  const cls =
    variant === "danger"
      ? "bg-red-500 text-white"
      : variant === "info"
        ? "bg-brand-500 text-white"
        : "bg-yellow-500 text-white";
  return (
    <span
      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none min-w-[1.25rem] text-center ${cls}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function getBadgeForHref(
  href: string,
  badges?: NavBadges
): { count: number; variant: "warning" | "danger" | "info" } | null {
  if (!badges) return null;
  if (href === "/paie" && (badges.paie ?? 0) > 0) {
    return { count: badges.paie!, variant: "warning" };
  }
  if (href === "/locations" && (badges.locations ?? 0) > 0) {
    return { count: badges.locations!, variant: "danger" };
  }
  if (href === "/sorties" && (badges.sorties ?? 0) > 0) {
    return { count: badges.sorties!, variant: "danger" };
  }
  if (href === "/incidents" && (badges.incidents ?? 0) > 0) {
    return { count: badges.incidents!, variant: "warning" };
  }
  if (href === "/demandes" && (badges.demandes ?? 0) > 0) {
    return { count: badges.demandes!, variant: "warning" };
  }
  if (href === "/admin/users" && (badges.adminUsers ?? 0) > 0) {
    return { count: badges.adminUsers!, variant: "warning" };
  }
  return null;
}

function NavLeaf({
  href,
  label,
  icon: Icon,
  active,
  badge,
  size = "md",
}: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  active: boolean;
  badge?: { count: number; variant: "warning" | "danger" | "info" } | null;
  size?: "md" | "sm";
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 transition-colors",
        size === "sm" ? "pl-9 pr-4 py-2 text-sm" : "px-5 py-2.5 text-sm",
        active
          ? "bg-brand-50 text-brand-700 dark:bg-brand-200/30 dark:text-brand-700 font-medium border-r-2 border-brand-500"
          : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
      )}
    >
      <Icon size={size === "sm" ? 15 : 18} />
      <span className="flex-1 truncate">{label}</span>
      {badge && <NavBadge count={badge.count} variant={badge.variant} />}
    </Link>
  );
}

function NavGroupSection({
  group,
  pathname,
  navBadges,
  defaultOpen,
}: {
  group: NavGroup;
  pathname: string | null;
  navBadges?: NavBadges;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // Si on navigue vers un item du groupe, on l'ouvre
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  // Compteur cumulé sur le groupe (pour pastille à côté du label)
  const groupBadgeCount = group.items.reduce((sum, it) => {
    const b = getBadgeForHref(it.href, navBadges);
    return sum + (b?.count ?? 0);
  }, 0);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-2 text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
      >
        <group.icon size={14} />
        <span className="flex-1 text-left">{group.label}</span>
        {!open && groupBadgeCount > 0 && (
          <NavBadge count={groupBadgeCount} variant="warning" />
        )}
        <ChevronRight
          size={12}
          className={cn(
            "transition-transform",
            open ? "rotate-90" : "rotate-0"
          )}
        />
      </button>
      {open && (
        <div>
          {group.items.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href || pathname?.startsWith(href + "/");
            const badge = getBadgeForHref(href, navBadges);
            return (
              <NavLeaf
                key={href}
                href={href}
                label={label}
                icon={Icon}
                active={active ?? false}
                badge={badge}
                size="sm"
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export function DesktopSidebar({
  userName,
  userRole,
  pendingUsersCount,
  navBadges,
  clientVisibility,
  signOutAction,
  bell,
}: {
  userName: string;
  userRole: string;
  pendingUsersCount: number;
  navBadges?: NavBadges;
  clientVisibility?: ClientVisibility;
  signOutAction: () => Promise<void>;
  bell?: React.ReactNode;
}) {
  const pathname = usePathname();
  const isAdmin = userRole === "ADMIN";
  const isClient = userRole === "CLIENT";

  // Filtre des groupes selon rôle + filtre des items dans chaque groupe
  const visibleGroups = useMemo(() => {
    return groups
      .filter((g) => (!g.adminOnly || isAdmin) && (!g.clientHidden || !isClient))
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (it) =>
            (!it.adminOnly || isAdmin) &&
            (!it.clientHidden || !isClient) &&
            (!isClient || applyClientVisibility(it, clientVisibility))
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [isAdmin, isClient, clientVisibility]);

  const isOnDashboard = pathname === "/dashboard";
  const isOnProfile = pathname?.startsWith("/profil");
  const isOnAdmin =
    pathname?.startsWith("/admin") || pathname?.startsWith("/parametres");

  return (
    <aside className="hidden md:flex w-60 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 h-screen self-start">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 shrink-0">
        <Link
          href="/profil"
          className="flex items-center gap-3 min-w-0 hover:bg-slate-50 dark:hover:bg-slate-800 -mx-2 px-2 py-1 rounded-md transition flex-1"
          title="Mon profil"
        >
          <Image
            src="/brand/logo-icon.webp"
            alt="Autonhome"
            width={32}
            height={32}
            className="rounded-md object-contain shrink-0 bg-white"
          />
          <div className="min-w-0">
            <div className="font-bold text-brand-700 dark:text-brand-700 leading-tight text-sm">
              Autonhome
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1">
              <UserCircle size={10} />
              {userName}
            </div>
          </div>
        </Link>
        {bell}
      </div>

      <nav className="flex-1 overflow-y-auto py-2 space-y-0.5">
        {/* Tableau de bord — toujours en haut, isolé */}
        <NavLeaf
          href={dashboardItem.href}
          label={dashboardItem.label}
          icon={dashboardItem.icon}
          active={isOnDashboard}
        />

        {/* Groupes */}
        {visibleGroups.map((g) => {
          // Le groupe est ouvert par défaut si on est dedans
          const isInGroup = g.items.some(
            (it) =>
              pathname === it.href || pathname?.startsWith(it.href + "/")
          );
          return (
            <NavGroupSection
              key={g.key}
              group={g}
              pathname={pathname}
              navBadges={navBadges}
              defaultOpen={isInGroup}
            />
          );
        })}

        {/* Section Administration (admin uniquement) */}
        {isAdmin && (
          <NavGroupSection
            key="admin-group"
            group={{
              key: "admin",
              label: "Administration",
              icon: ShieldCheck,
              items: [
                { href: "/admin/users", label: "Utilisateurs", icon: ShieldCheck },
                { href: "/parametres", label: "Paramètres", icon: Settings },
              ],
            }}
            pathname={pathname}
            navBadges={{ ...navBadges, adminUsers: pendingUsersCount }}
            defaultOpen={isOnAdmin ?? false}
          />
        )}

        {/* Compte — Mon profil isolé en bas */}
        <div className="pt-2">
          <NavLeaf
            href="/profil"
            label="Mon profil"
            icon={UserCircle}
            active={isOnProfile ?? false}
          />
        </div>
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

export function MobileBottomNav({
  isAdmin,
  isClient,
  pendingUsersCount,
  navBadges,
  clientVisibility,
}: {
  isAdmin?: boolean;
  isClient?: boolean;
  pendingUsersCount?: number;
  navBadges?: NavBadges;
  clientVisibility?: ClientVisibility;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  // Ferme le drawer quand on navigue
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  // Bloque le scroll body quand le drawer est ouvert
  useEffect(() => {
    if (moreOpen) {
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [moreOpen]);

  const mobilePrimaryRaw = isClient
    ? mobilePrimaryClient
    : isAdmin
      ? mobilePrimaryAdmin
      : mobilePrimaryChef;

  // Filtre les items selon la visibilité du client
  const mobilePrimary = isClient
    ? mobilePrimaryRaw.filter((it) => applyClientVisibility(it, clientVisibility))
    : mobilePrimaryRaw;

  // Filtre des items du drawer "Plus" pour le client
  const filteredMobileMore = mobileMore.filter(
    (m) =>
      (!m.clientHidden || !isClient) &&
      (!isClient || applyClientVisibility(m, clientVisibility))
  );

  const moreActive = filteredMobileMore.some(
    (i) => pathname === i.href || pathname?.startsWith(i.href + "/")
  );

  // Compteur cumulé pour le badge sur le bouton "Plus" : tout ce qui n'est
  // pas dans la barre primaire (locations + sorties + admin)
  const moreBadgeCount =
    (navBadges?.locations ?? 0) +
    (navBadges?.sorties ?? 0) +
    (isAdmin ? (pendingUsersCount ?? 0) : 0);

  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 grid grid-cols-5"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {mobilePrimary.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname?.startsWith(href + "/");
          const badge = getBadgeForHref(href, navBadges);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] relative",
                active
                  ? "text-brand-700 dark:text-brand-400"
                  : "text-slate-600 dark:text-slate-400"
              )}
            >
              <Icon size={20} />
              <span className="truncate max-w-full px-1">{label}</span>
              {badge && (
                <span
                  className={`absolute top-1 right-3 text-[9px] font-bold px-1 py-px rounded-full leading-none min-w-[1rem] text-center ${
                    badge.variant === "danger"
                      ? "bg-red-500 text-white"
                      : "bg-yellow-500 text-white"
                  }`}
                >
                  {badge.count > 99 ? "99+" : badge.count}
                </span>
              )}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={cn(
            "flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] relative",
            moreActive
              ? "text-brand-700 dark:text-brand-400"
              : "text-slate-600 dark:text-slate-400"
          )}
        >
          <Menu size={20} />
          <span>Plus</span>
          {moreBadgeCount > 0 && (
            <span className="absolute top-1 right-3 bg-yellow-500 text-white text-[9px] font-bold px-1 py-px rounded-full leading-none min-w-[1rem] text-center">
              {moreBadgeCount > 99 ? "99+" : moreBadgeCount}
            </span>
          )}
        </button>
      </nav>

      {/* Drawer "Plus" */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex flex-col">
          {/* Overlay */}
          <button
            type="button"
            onClick={() => setMoreOpen(false)}
            className="flex-1 bg-black/50 backdrop-blur-sm"
            aria-label="Fermer le menu"
          />
          {/* Panel */}
          <div
            className="bg-white dark:bg-slate-900 rounded-t-2xl border-t border-slate-200 dark:border-slate-800 max-h-[80vh] overflow-y-auto"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10">
              <h2 className="font-semibold text-slate-900 dark:text-slate-100">
                Tout le menu
              </h2>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                aria-label="Fermer"
              >
                <X size={20} />
              </button>
            </div>

            <nav className="p-2">
              {filteredMobileMore
                .filter((m) => !mobilePrimary.some((p) => p.href === m.href))
                .map(({ href, label, icon: Icon }) => {
                const active =
                  pathname === href || pathname?.startsWith(href + "/");
                const badge = getBadgeForHref(href, navBadges);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition",
                      active
                        ? "bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 font-medium"
                        : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    )}
                  >
                    <Icon size={20} />
                    <span className="flex-1">{label}</span>
                    {badge && (
                      <NavBadge count={badge.count} variant={badge.variant} />
                    )}
                  </Link>
                );
              })}

              {isAdmin && (
                <>
                  <div className="mt-3 mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Administration
                  </div>
                  <Link
                    href="/admin/users"
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition",
                      pathname?.startsWith("/admin")
                        ? "bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 font-medium"
                        : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    )}
                  >
                    <ShieldCheck size={20} />
                    <span className="flex-1">Utilisateurs</span>
                    {(pendingUsersCount ?? 0) > 0 && (
                      <span className="bg-yellow-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        {pendingUsersCount}
                      </span>
                    )}
                  </Link>
                  <Link
                    href="/parametres"
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition",
                      pathname?.startsWith("/parametres")
                        ? "bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 font-medium"
                        : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    )}
                  >
                    <Settings size={20} />
                    Paramètres
                  </Link>
                </>
              )}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}

export function MobileTopBar({
  userName,
  signOutAction,
  bell,
}: {
  userName: string;
  signOutAction: () => Promise<void>;
  bell?: React.ReactNode;
}) {
  return (
    <header className="md:hidden sticky top-0 z-20 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 py-2 flex items-center justify-between gap-2">
      <BrandHeader subtitle={userName} href="/profil" />
      <div className="flex items-center gap-1">
        {bell}
        <ThemeToggle compact />
        <form action={signOutAction}>
          <button
            type="submit"
            className="text-slate-500 dark:text-slate-400 p-2"
            aria-label="Se déconnecter"
          >
            <LogOut size={18} />
          </button>
        </form>
      </div>
    </header>
  );
}
