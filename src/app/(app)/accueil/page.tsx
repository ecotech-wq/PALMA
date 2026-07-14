import Link from "next/link";
import {
  LayoutDashboard,
  MessageSquare,
  Hammer,
  DraftingCompass,
  Timer,
  CheckSquare,
  Calendar,
  FileText,
  AlertTriangle,
  Wrench,
  HardHat,
  Users,
  Wallet,
  Banknote,
  FileSignature,
  FlaskConical,
  ShieldCheck,
  UserCircle,
} from "lucide-react";
import { requireAuth } from "@/lib/auth-helpers";

// ─── Écran d'accueil LYNX : lanceur d'applications (façon Odoo) ──────────────
// Une grille de tuiles sombres (charte : « sur l'écran d'accueil, LYNX est
// sombre »), filtrée par les MODULES de l'entreprise courante et par le rôle.
// Autonhome (module chantier) et EcoTech (module be) n'exposent donc pas les
// mêmes outils. Les icônes sont au trait, monochromes ; l'ambre reste réservé
// au signal, pas à la décoration des tuiles.

type Tile = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
  pilotOnly?: boolean;
  clientHidden?: boolean;
  clientOnly?: boolean;
  module?: string;
};

const TILES: Tile[] = [
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/messagerie", label: "Messagerie", icon: MessageSquare, clientHidden: true },
  { href: "/chantiers", label: "Chantiers", icon: Hammer, module: "chantier" },
  { href: "/be", label: "Études", icon: DraftingCompass, module: "be", clientHidden: true },
  { href: "/be/temps", label: "Mes temps", icon: Timer, module: "be", clientHidden: true },
  { href: "/pointage", label: "Pointage", icon: CheckSquare, module: "chantier", clientHidden: true },
  { href: "/planning", label: "Planning", icon: Calendar, module: "chantier", pilotOnly: true },
  { href: "/rapports", label: "Rapports", icon: FileText, module: "chantier" },
  { href: "/incidents", label: "Incidents", icon: AlertTriangle },
  { href: "/materiel", label: "Matériel", icon: Wrench, module: "chantier", clientHidden: true },
  { href: "/ouvriers", label: "Ouvriers", icon: HardHat, module: "chantier", pilotOnly: true },
  { href: "/equipes", label: "Équipes", icon: Users, module: "chantier", pilotOnly: true },
  { href: "/finance", label: "Suivi financier", icon: Wallet, pilotOnly: true },
  { href: "/labo", label: "Laboratoire", icon: FlaskConical, pilotOnly: true },
  { href: "/paie", label: "Paie", icon: Banknote, adminOnly: true, module: "chantier" },
  { href: "/mes-documents", label: "Mes documents", icon: FileSignature, clientOnly: true },
  { href: "/admin/users", label: "Administration", icon: ShieldCheck, adminOnly: true },
  { href: "/profil", label: "Mon profil", icon: UserCircle },
];

export default async function AccueilPage() {
  const me = await requireAuth();

  const tiles = TILES.filter(
    (t) =>
      (!t.adminOnly || me.isAdmin) &&
      (!t.pilotOnly || me.canPilot) &&
      (!t.clientHidden || !me.isClient) &&
      (!t.clientOnly || me.isClient) &&
      (!t.module || me.modules.includes(t.module))
  );

  const prenom = me.name.split(" ")[0] || me.name;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Bonjour {prenom}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {me.espaceCourant
            ? me.espaceCourant.nom
            : me.espaces.length > 1
              ? "Toutes les entreprises"
              : "Vos outils"}
        </p>
      </div>

      <nav
        aria-label="Applications"
        className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7"
      >
        {tiles.map(({ href, label, icon: Icon }) => (
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
    </div>
  );
}
