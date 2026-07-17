import Link from "next/link";
import {
  MessageSquare,
  Hammer,
  DraftingCompass,
  Timer,
  CheckSquare,
  Calendar,
  CalendarRange,
  FileText,
  AlertTriangle,
  Wrench,
  HardHat,
  Users,
  Wallet,
  Banknote,
  FileSignature,
  FlaskConical,
  Handshake,
  ShieldCheck,
  ShoppingCart,
  ArrowLeftRight,
  Truck,
  Download,
  UserCircle,
} from "lucide-react";
import { requireAuth } from "@/lib/auth-helpers";

// ─── Accueil LYNX : le lanceur d'applications ────────────────────────────────
// L'accueil redevient LA grille pure : toutes les applications de l'espace,
// rangées en quatre sections sobres (Quotidien, Pilotage, Ressources,
// Suivi et administration). L'écran d'atterrissage « Ma journée » vit sur
// /aujourdhui ; ici, rien d'autre que les tuiles, filtrées par rôle et par
// module comme la barre latérale.

type Tile = {
  href: string;
  label: string;
  icon: typeof MessageSquare;
  adminOnly?: boolean;
  pilotOnly?: boolean;
  clientHidden?: boolean;
  clientOnly?: boolean;
  module?: string;
};

type Section = {
  titre: string;
  tiles: Tile[];
};

// Gating identique à la barre latérale (NavSidebar) : mêmes drapeaux de rôle
// et de module par destination. La tuile « Tableau de bord » est retirée :
// /dashboard n'est plus qu'une redirection vers /aujourdhui.
const SECTIONS: Section[] = [
  {
    titre: "Quotidien",
    tiles: [
      { href: "/messagerie", label: "Messagerie", icon: MessageSquare, clientHidden: true },
      // Affaires (CRM) : juste après Messagerie, comme dans la sidebar.
      // Réservé aux pilotes comme le suivi financier ; pas de garde de
      // module : une affaire précède le projet.
      { href: "/affaires", label: "Affaires", icon: Handshake, pilotOnly: true },
      { href: "/planning", label: "Planning", icon: Calendar, module: "chantier", pilotOnly: true },
      { href: "/pointage", label: "Pointage", icon: CheckSquare, module: "chantier", clientHidden: true },
      // Bureau d'études : la saisie des temps est un geste quotidien.
      { href: "/be/temps", label: "Mes temps", icon: Timer, module: "be", clientHidden: true },
      // Volet contractuel du client (devis, situations, factures à signer).
      { href: "/mes-documents", label: "Mes documents", icon: FileSignature, clientOnly: true },
    ],
  },
  {
    titre: "Pilotage",
    tiles: [
      { href: "/chantiers", label: "Chantiers", icon: Hammer, module: "chantier" },
      { href: "/be", label: "Études", icon: DraftingCompass, module: "be", clientHidden: true },
      { href: "/finance", label: "Suivi financier", icon: Wallet, pilotOnly: true },
      { href: "/labo", label: "Laboratoire", icon: FlaskConical, pilotOnly: true },
    ],
  },
  {
    titre: "Ressources",
    tiles: [
      { href: "/ouvriers", label: "Ouvriers", icon: HardHat, module: "chantier", pilotOnly: true },
      { href: "/equipes", label: "Équipes", icon: Users, module: "chantier", pilotOnly: true },
      { href: "/materiel", label: "Matériel", icon: Wrench, module: "chantier", clientHidden: true },
      { href: "/commandes", label: "Commandes", icon: ShoppingCart, module: "chantier", pilotOnly: true },
      { href: "/sorties", label: "Sorties / Retours", icon: ArrowLeftRight, module: "chantier", clientHidden: true },
      { href: "/locations", label: "Locations / Prêts", icon: Truck, module: "chantier", pilotOnly: true },
    ],
  },
  {
    titre: "Suivi et administration",
    tiles: [
      { href: "/incidents", label: "Incidents", icon: AlertTriangle },
      { href: "/rapports", label: "Rapports", icon: FileText, module: "chantier" },
      { href: "/rapports-hebdo", label: "Rapports hebdo", icon: CalendarRange, module: "chantier", pilotOnly: true },
      { href: "/paie", label: "Paie", icon: Banknote, adminOnly: true, module: "chantier" },
      { href: "/admin/users", label: "Administration", icon: ShieldCheck, adminOnly: true },
      { href: "/exports", label: "Exports", icon: Download, adminOnly: true },
      { href: "/profil", label: "Mon profil", icon: UserCircle },
    ],
  },
];

export default async function AccueilPage() {
  const me = await requireAuth();

  const sections = SECTIONS.map((s) => ({
    titre: s.titre,
    tiles: s.tiles.filter(
      (t) =>
        (!t.adminOnly || me.isAdmin) &&
        (!t.pilotOnly || me.canPilot) &&
        (!t.clientHidden || !me.isClient) &&
        (!t.clientOnly || me.isClient) &&
        (!t.module || me.modules.includes(t.module))
    ),
  })).filter((s) => s.tiles.length > 0);

  return (
    <div>
      {/* En-tête sobre : le nom de l'écran et le périmètre courant. */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Accueil
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Toutes les applications
          {me.espaceCourant
            ? ` · ${me.espaceCourant.nom}`
            : me.espaces.length > 1
              ? " · toutes les entreprises"
              : ""}
        </p>
      </div>

      {sections.map((s) => (
        <section key={s.titre} className="mb-7">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {s.titre}
          </h2>
          <nav
            aria-label={s.titre}
            className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7"
          >
            {s.tiles.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="group flex flex-col items-center gap-2 rounded-xl p-2 transition hover:bg-slate-100 dark:hover:bg-slate-800/60"
              >
                {/* Tuile d'app : toujours sombre (encre), icône claire au trait. */}
                <span className="flex h-16 w-16 items-center justify-center rounded-[14px] bg-slate-950 text-slate-50 shadow-sm transition group-hover:-translate-y-0.5 group-active:translate-y-0">
                  <Icon size={26} strokeWidth={2} />
                </span>
                <span className="text-center text-xs font-medium leading-tight text-slate-700 dark:text-slate-300">
                  {label}
                </span>
              </Link>
            ))}
          </nav>
        </section>
      ))}
    </div>
  );
}
