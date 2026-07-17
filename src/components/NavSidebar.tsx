"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  LayoutGrid,
  CalendarCheck,
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
  MessageSquare,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  DraftingCompass,
  Timer,
  Download,
  Trash2,
  Wallet,
  FileSignature,
  FlaskConical,
  Building2,
  Handshake,
  ListTodo,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/theme";
import { EspaceSwitcher } from "@/features/espaces/EspaceSwitcher";
import { EspaceSwitcherMobile } from "@/features/espaces/EspaceSwitcherMobile";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SearchTrigger } from "@/components/SearchTrigger";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Visible uniquement par ADMIN (ex : /paie) */
  adminOnly?: boolean;
  /** Visible par ADMIN + CONDUCTEUR (ex : /ouvriers, /commandes, /locations) */
  pilotOnly?: boolean;
  /** Caché pour le rôle CLIENT */
  clientHidden?: boolean;
  /** Réservé au rôle CLIENT (ex : /mes-documents). */
  clientOnly?: boolean;
  /** Module (app) requis : "chantier", "be"... (socle espaces 2026-07-07). */
  module?: string;
};

type NavGroup = {
  key: string;
  label: string;
  icon: typeof LayoutDashboard;
  items: NavItem[];
  /** Cache tout le groupe pour le rôle CLIENT */
  clientHidden?: boolean;
  adminOnly?: boolean;
  pilotOnly?: boolean;
  /** Module (app) requis pour tout le groupe. */
  module?: string;
};

// Item solo « Aujourd'hui » : l'atterrissage (Ma journée), toujours en
// premier, pour tous les rôles (le client y reçoit sa vue dédiée).
const aujourdhuiItem: NavItem = {
  href: "/aujourdhui",
  label: "Aujourd'hui",
  icon: CalendarCheck,
};

// Item solo « Accueil » : le lanceur d'applications (la grille), juste
// sous Aujourd'hui. C'est l'ancienne entrée « Tableau de bord ».
const accueilItem: NavItem = {
  href: "/accueil",
  label: "Accueil",
  icon: LayoutGrid,
};

// Item solo Messagerie — entrée principale du fil chantier (chat-first).
// Cachée pour les clients (lecture rapport seulement).
const messagerieItem: NavItem = {
  href: "/messagerie",
  label: "Messagerie",
  icon: MessageSquare,
  clientHidden: true,
};

// Groupes thématiques pour la sidebar — repliables, pré-ouverts si on est dedans
const groups: NavGroup[] = [
  {
    key: "chantiers",
    label: "Chantiers & équipes",
    icon: Hammer,
    module: "chantier",
    items: [
      { href: "/chantiers", label: "Chantiers", icon: Hammer },
      // Gestion des équipes = pilotage (création, affectation) : admin + conducteur
      { href: "/equipes", label: "Équipes", icon: Users, clientHidden: true, pilotOnly: true },
      // Fiche ouvrier expose tarifs : admin + conducteur seulement
      { href: "/ouvriers", label: "Ouvriers", icon: HardHat, clientHidden: true, pilotOnly: true },
    ],
  },
  // OPC = ordonnancement, pilotage, coordination. Réservé admin +
  // conducteur de travaux. C'est là qu'on gère le planning, les
  // rapports hebdo envoyés au client et les PV de réception (OPR).
  {
    key: "opc",
    label: "OPC",
    icon: ClipboardList,
    pilotOnly: true,
    module: "chantier",
    items: [
      { href: "/planning", label: "Planning", icon: Calendar },
      { href: "/rapports-hebdo", label: "Rapports hebdo", icon: CalendarRange },
      { href: "/pv-reception", label: "PV de réception", icon: ClipboardCheck },
    ],
  },
  {
    key: "terrain",
    label: "Suivi terrain",
    icon: FileText,
    module: "chantier",
    items: [
      { href: "/pointage", label: "Pointage", icon: CheckSquare, clientHidden: true },
      { href: "/rapports", label: "Rapports quotidiens", icon: FileText },
      { href: "/incidents", label: "Incidents", icon: AlertTriangle },
    ],
  },
  // Bureau d'études : les études sont des projets typés (VISION-LYNX-V4,
  // phase 1 du module BE). Réservé à l'équipe interne.
  {
    key: "be",
    label: "Bureau d'études",
    icon: DraftingCompass,
    clientHidden: true,
    module: "be",
    items: [
      { href: "/be", label: "Études", icon: DraftingCompass },
      { href: "/be/temps", label: "Mes temps", icon: Timer },
    ],
  },
  {
    key: "materiel",
    label: "Matériel & achats",
    icon: Wrench,
    clientHidden: true,
    module: "chantier",
    items: [
      // Matériel & sorties : tout le monde (prix masqués pour CHEF)
      { href: "/materiel", label: "Matériel", icon: Wrench },
      { href: "/sorties", label: "Sorties / Retours", icon: ArrowLeftRight },
      // Locations & commandes : admin + conducteur seulement (prix sensibles)
      { href: "/locations", label: "Locations / Prêts", icon: Truck, pilotOnly: true },
      { href: "/commandes", label: "Commandes", icon: ShoppingCart, pilotOnly: true },
      { href: "/demandes", label: "Demandes matériel", icon: Package },
    ],
  },
  {
    key: "finance",
    label: "Finances",
    icon: Banknote,
    // Pilotage (admin + conducteur). Le suivi commercial vaut pour le chantier
    // ET le bureau d'études : pas de garde de module au niveau du groupe.
    pilotOnly: true,
    items: [
      // Affaires (CRM) : le pipeline commercial en amont des projets.
      { href: "/affaires", label: "Affaires", icon: Handshake },
      // Suivi commercial et financier : devis, situations, factures, encaissements.
      { href: "/finance", label: "Suivi financier", icon: Wallet },
      // Paie : ADMIN seul, et seulement dans un espace « chantier ».
      { href: "/paie", label: "Paie", icon: Banknote, adminOnly: true, module: "chantier" },
    ],
  },
  {
    key: "labo",
    label: "Laboratoire",
    icon: FlaskConical,
    // Pilotage (admin + conducteur), même verrou que le suivi financier.
    // Pas de garde de module : le labo sert le chantier ET la R&D interne.
    pilotOnly: true,
    items: [
      { href: "/labo", label: "Laboratoire", icon: FlaskConical },
    ],
  },
];

// Barre de tab mobile, variante par rôle. Messagerie est promue en
// onglet primaire pour tous les rôles non-client (entrée chat-first).
//
// Arbitrage « Tâches » (2026-07-17) : pour les rôles de PILOTAGE, l'entrée
// la moins quotidienne de la barre était Pointage : un pilote ne pointe
// pas lui-même, il valide les heures via la paie et suit le terrain par la
// messagerie ; sa boucle quotidienne, c'est la liste d'actions (relances
// d'affaires, tâches confiées). On remplace donc Pointage par « Tâches »
// (ancre #taches de l'accueil Ma journée) pour ADMIN et CONDUCTEUR, SANS
// toucher à Messagerie ; Pointage reste à un tap dans le tiroir « Plus ».
// Les rôles de TERRAIN (CHEF, OUVRIER) gardent Pointage : c'est leur geste
// du matin et du soir.
//
// Arbitrage « Aujourd'hui / Accueil » (2026-07-17) : l'atterrissage devient
// /aujourdhui ; il prend le premier onglet de la barre pour tous les rôles.
// Le lanceur (Accueil, la grille) descend dans le tiroir « Plus » : sur
// téléphone, on ouvre une app pour agir (messagerie, tâches, pointage),
// pas pour contempler la grille ; elle reste à deux taps. Les 4e onglets
// par rôle sont conservés (Paie admin, Planning conducteur, Rapports
// chef/client) : la barre a cinq colonnes, autant les employer.
const mobilePrimaryAdmin: NavItem[] = [
  { href: "/aujourdhui", label: "Aujourd'hui", icon: CalendarCheck },
  { href: "/messagerie", label: "Messagerie", icon: MessageSquare },
  { href: "/aujourdhui#taches", label: "Tâches", icon: ListTodo },
  { href: "/paie", label: "Paie", icon: Banknote, adminOnly: true },
];
const mobilePrimaryConducteur: NavItem[] = [
  { href: "/aujourdhui", label: "Aujourd'hui", icon: CalendarCheck },
  { href: "/messagerie", label: "Messagerie", icon: MessageSquare },
  { href: "/aujourdhui#taches", label: "Tâches", icon: ListTodo },
  { href: "/planning", label: "Planning", icon: Calendar },
];
const mobilePrimaryChef: NavItem[] = [
  { href: "/aujourdhui", label: "Aujourd'hui", icon: CalendarCheck },
  { href: "/messagerie", label: "Messagerie", icon: MessageSquare },
  { href: "/pointage", label: "Pointage", icon: CheckSquare },
  { href: "/rapports", label: "Rapports", icon: FileText },
];
const mobilePrimaryClient: NavItem[] = [
  { href: "/aujourdhui", label: "Aujourd'hui", icon: CalendarCheck },
  { href: "/chantiers", label: "Chantiers", icon: Hammer },
  { href: "/rapports", label: "Rapports", icon: FileText },
  { href: "/incidents", label: "Incidents", icon: AlertTriangle },
];

// Tout le reste, accessible via le bouton "Plus"
const mobileMore: NavItem[] = [
  // Le lanceur d'applications (la grille) : premier item du tiroir.
  // Caché au client : le proxy le renvoie de /accueil vers /aujourdhui.
  { href: "/accueil", label: "Accueil", icon: LayoutGrid, clientHidden: true },
  { href: "/chantiers", label: "Chantiers", icon: Hammer },
  // Pointage : sorti de la barre primaire des pilotes (remplacé par
  // Tâches), il reste ici ; filtré automatiquement pour les rôles qui
  // l'ont déjà en barre primaire (CHEF, OUVRIER).
  { href: "/pointage", label: "Pointage", icon: CheckSquare, clientHidden: true, module: "chantier" },
  // Volet contractuel du client (devis/situations/factures à signer).
  { href: "/mes-documents", label: "Mes documents", icon: FileSignature, clientOnly: true },
  // Bureau d'études : saisie des temps au téléphone (stand-up du matin)
  { href: "/be", label: "Études", icon: DraftingCompass, clientHidden: true, module: "be" },
  { href: "/be/temps", label: "Mes temps", icon: Timer, clientHidden: true, module: "be" },
  { href: "/equipes", label: "Équipes", icon: Users, clientHidden: true, pilotOnly: true },
  { href: "/materiel", label: "Matériel", icon: Wrench, clientHidden: true },
  { href: "/sorties", label: "Sorties / Retours", icon: ArrowLeftRight, clientHidden: true },
  // Prix sensibles : admin + conducteur uniquement
  { href: "/locations", label: "Locations / Prêts", icon: Truck, clientHidden: true, pilotOnly: true },
  { href: "/commandes", label: "Commandes", icon: ShoppingCart, clientHidden: true, pilotOnly: true },
  // Affaires (CRM) : admin + conducteur (pipeline commercial)
  { href: "/affaires", label: "Affaires", icon: Handshake, clientHidden: true, pilotOnly: true },
  // Suivi financier : admin + conducteur (devis, situations, factures)
  { href: "/finance", label: "Suivi financier", icon: Wallet, clientHidden: true, pilotOnly: true },
  // Laboratoire : admin + conducteur (essais, formulations, rapports)
  { href: "/labo", label: "Laboratoire", icon: FlaskConical, clientHidden: true, pilotOnly: true },
  // OPC : admin + conducteur
  { href: "/planning", label: "Planning", icon: Calendar, clientHidden: true, pilotOnly: true },
  { href: "/rapports-hebdo", label: "Rapports hebdo", icon: CalendarRange, pilotOnly: true },
  { href: "/pv-reception", label: "PV de réception", icon: ClipboardCheck, pilotOnly: true },
  // Suivi terrain (visible CHEF)
  { href: "/rapports", label: "Rapports quotidiens", icon: FileText },
  { href: "/incidents", label: "Incidents", icon: AlertTriangle },
  { href: "/demandes", label: "Demandes matériel", icon: Package, clientHidden: true },
  { href: "/profil", label: "Mon profil", icon: UserCircle },
];

function BrandHeader({
  subtitle,
  href = "/aujourdhui",
}: {
  subtitle?: string;
  href?: string;
}) {
  return (
    <Link href={href} className="flex items-center gap-3 min-w-0">
      <Image
        src={BRAND.logoIcon}
        alt={BRAND.appName}
        width={36}
        height={36}
        className="rounded-md object-contain shrink-0"
      />
      <div className="min-w-0">
        <div className="font-mono font-semibold tracking-[0.14em] text-slate-900 dark:text-slate-100 leading-tight">
          {BRAND.appName}
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
  messagerie?: number;
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
  if (href === "/messagerie" && (badges.messagerie ?? 0) > 0) {
    return { count: badges.messagerie!, variant: "info" };
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
          ? "bg-slate-100 dark:bg-slate-800/70 font-medium border-r-2"
          : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
      )}
      style={
        active
          ? {
              color: "var(--space-accent, var(--brand-primary-700))",
              borderColor: "var(--space-accent, var(--brand-primary-500))",
            }
          : undefined
      }
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
  modules,
  espaces,
  espaceCourantId,
  canSwitchEspace,
}: {
  userName: string;
  userRole: string;
  pendingUsersCount: number;
  navBadges?: NavBadges;
  clientVisibility?: ClientVisibility;
  signOutAction: () => Promise<void>;
  bell?: React.ReactNode;
  /** Modules (apps) actifs dans l'espace courant (socle espaces). */
  modules?: string[];
  espaces?: { id: string; nom: string; couleur?: string | null }[];
  espaceCourantId?: string | null;
  /** Seul l'admin (propriétaire de plateforme) bascule entre entreprises. */
  canSwitchEspace?: boolean;
}) {
  const pathname = usePathname();
  const isAdmin = userRole === "ADMIN";
  const isConducteur = userRole === "CONDUCTEUR";
  const isClient = userRole === "CLIENT";
  const canPilot = isAdmin || isConducteur;

  // Filtre des groupes selon rôle + filtre des items dans chaque groupe
  const visibleGroups = useMemo(() => {
    return groups
      .filter(
        (g) =>
          (!g.adminOnly || isAdmin) &&
          (!g.pilotOnly || canPilot) &&
          (!g.clientHidden || !isClient) &&
          (!g.module || !modules || modules.includes(g.module))
      )
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (it) =>
            (!it.adminOnly || isAdmin) &&
            (!it.pilotOnly || canPilot) &&
            (!it.clientHidden || !isClient) &&
            // Garde de module AU NIVEAU DE L'ITEM (ex : /paie n'apparaît que
            // dans un espace « chantier »), comme le filtre mobile.
            (!it.module || !modules || modules.includes(it.module)) &&
            (!isClient || applyClientVisibility(it, clientVisibility))
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [isAdmin, isConducteur, canPilot, isClient, clientVisibility, modules]);

  const isOnAujourdhui = pathname === "/aujourdhui";
  const isOnAccueil = pathname === "/accueil";
  const isOnProfile = pathname?.startsWith("/profil");
  const isOnAdmin =
    pathname?.startsWith("/admin") || pathname?.startsWith("/parametres");

  return (
    <aside
      className="hidden md:flex w-60 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 h-screen self-start"
      style={{ borderTop: "3px solid var(--space-accent, transparent)" }}
    >
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 shrink-0">
        <Link
          href="/aujourdhui"
          className="flex items-center gap-3 min-w-0 hover:bg-slate-50 dark:hover:bg-slate-800 -mx-2 px-2 py-1 rounded-md transition flex-1"
          title="Aujourd'hui"
        >
          <Image
            src={BRAND.logoIcon}
            alt={BRAND.appName}
            width={32}
            height={32}
            className="rounded-md object-contain shrink-0"
          />
          <div className="min-w-0">
            <div className="font-mono font-semibold tracking-[0.14em] text-slate-900 dark:text-slate-100 leading-tight text-sm">
              {BRAND.appName}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1">
              <UserCircle size={10} />
              {userName}
            </div>
          </div>
        </Link>
        {bell}
      </div>

      {/* Sélecteur d'entreprise (socle espaces) : rendu si plusieurs espaces,
          ET seulement pour l'admin (seul habilité à basculer). */}
      {canSwitchEspace && espaces && espaces.length > 1 && (
        <div className="border-b border-slate-200 dark:border-slate-800">
          <EspaceSwitcher espaces={espaces} courantId={espaceCourantId ?? null} />
        </div>
      )}

      {/* Trigger de recherche globale (ouvre la palette Ctrl+K) */}
      <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800">
        <SearchTrigger variant="sidebar" />
      </div>

      <nav className="flex-1 overflow-y-auto py-2 space-y-0.5">
        {/* Aujourd'hui : l'atterrissage, toujours en premier */}
        <NavLeaf
          href={aujourdhuiItem.href}
          label={aujourdhuiItem.label}
          icon={aujourdhuiItem.icon}
          active={isOnAujourdhui}
        />

        {/* Accueil : le lanceur d'applications (la grille). Caché au
            client, le proxy le renvoie de /accueil vers /aujourdhui. */}
        {!isClient && (
          <NavLeaf
            href={accueilItem.href}
            label={accueilItem.label}
            icon={accueilItem.icon}
            active={isOnAccueil}
          />
        )}

        {/* Messagerie — entrée principale du chat-first, cachée client */}
        {!isClient && (
          <NavLeaf
            href={messagerieItem.href}
            label={messagerieItem.label}
            icon={messagerieItem.icon}
            active={
              pathname === messagerieItem.href ||
              pathname?.startsWith(messagerieItem.href + "/") ||
              false
            }
            badge={getBadgeForHref(messagerieItem.href, navBadges)}
          />
        )}

        {/* Mes documents — volet contractuel, réservé au client */}
        {isClient && (
          <NavLeaf
            href="/mes-documents"
            label="Mes documents"
            icon={FileSignature}
            active={pathname?.startsWith("/mes-documents") ?? false}
          />
        )}

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
                { href: "/admin/espaces", label: "Entreprises", icon: Building2 },
                { href: "/admin/audit", label: "Journal d'audit", icon: FileText },
                { href: "/admin/corbeille", label: "Corbeille", icon: Trash2 },
                { href: "/exports", label: "Exports & FEC", icon: Download },
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
  isConducteur,
  isClient,
  pendingUsersCount,
  navBadges,
  clientVisibility,
  modules,
  espaces,
  espaceCourantId,
  canSwitchEspace,
}: {
  isAdmin?: boolean;
  isConducteur?: boolean;
  isClient?: boolean;
  pendingUsersCount?: number;
  navBadges?: NavBadges;
  clientVisibility?: ClientVisibility;
  /** Modules (apps) actifs dans l'espace courant. */
  modules?: string[];
  /** Sélecteur d'entreprise dans le tiroir « Plus » (socle espaces). */
  espaces?: { id: string; nom: string; couleur?: string | null }[];
  espaceCourantId?: string | null;
  /** Seul l'admin bascule entre entreprises. */
  canSwitchEspace?: boolean;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const canPilot = !!isAdmin || !!isConducteur;

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
      : isConducteur
        ? mobilePrimaryConducteur
        : mobilePrimaryChef;

  // Filtre les items selon la visibilité du client
  const mobilePrimary = isClient
    ? mobilePrimaryRaw.filter((it) => applyClientVisibility(it, clientVisibility))
    : mobilePrimaryRaw;

  // Filtre des items du drawer "Plus" : rôle + visibilité client
  const filteredMobileMore = mobileMore.filter(
    (m) =>
      (!m.adminOnly || isAdmin) &&
      (!m.pilotOnly || canPilot) &&
      (!m.clientHidden || !isClient) &&
      (!m.clientOnly || isClient) &&
      (!m.module || !modules || modules.includes(m.module)) &&
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
                !active && "text-slate-600 dark:text-slate-400"
              )}
              style={
                active
                  ? { color: "var(--space-accent, var(--brand-primary-500))" }
                  : undefined
              }
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
              {/* Sélecteur d'entreprise (socle espaces) : en tête du tiroir,
                  là où le pouce arrive. Réservé à l'admin. */}
              {canSwitchEspace && (
                <EspaceSwitcherMobile
                  espaces={espaces ?? []}
                  courantId={espaceCourantId ?? null}
                  onDone={() => setMoreOpen(false)}
                />
              )}
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
                    href="/admin/espaces"
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition",
                      pathname?.startsWith("/admin/espaces")
                        ? "bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 font-medium"
                        : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    )}
                  >
                    <Building2 size={20} />
                    Entreprises
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
    <header
      className="md:hidden sticky top-0 z-20 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 py-2 flex items-center justify-between gap-2"
      style={{ borderTop: "3px solid var(--space-accent, transparent)" }}
    >
      <BrandHeader subtitle={userName} href="/aujourdhui" />
      <div className="flex items-center gap-1">
        <SearchTrigger variant="topbar" />
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
