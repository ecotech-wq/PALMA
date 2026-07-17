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
  Handshake,
  ShieldCheck,
  UserCircle,
  ChevronRight,
} from "lucide-react";
import { db } from "@/lib/db";
import {
  requireAuth,
  getAccessibleChantierIds,
  chantierEspaceFilter,
  espaceFilter,
} from "@/lib/auth-helpers";
import { unreadMessagerieFor, unreadAffairesFor } from "@/lib/read-state";
import { estDormante } from "@/lib/affaires";
import { MesTaches, type TacheJournee } from "./MesTaches";

// ─── Accueil LYNX : « Ma journée » ───────────────────────────────────────────
// L'accueil n'est plus un simple lanceur : il ouvre la journée. En tête,
// les tâches de l'utilisateur (en retard en terracotta, puis aujourd'hui,
// puis 7 jours) avec la case à cocher rapide du planning ; puis la
// messagerie (fils de chantiers et d'affaires avec leurs non-lus, un tap
// pour ouvrir) ; enfin le lanceur d'applications, inchangé. Compact et
// pensé téléphone d'abord ; l'ambre reste réservé au signal.

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
  // Affaires (CRM) : pipeline commercial, réservé aux pilotes comme le
  // suivi financier. Pas de garde de module : une affaire précède le projet.
  { href: "/affaires", label: "Affaires", icon: Handshake, pilotOnly: true },
  { href: "/finance", label: "Suivi financier", icon: Wallet, pilotOnly: true },
  { href: "/labo", label: "Laboratoire", icon: FlaskConical, pilotOnly: true },
  { href: "/paie", label: "Paie", icon: Banknote, adminOnly: true, module: "chantier" },
  { href: "/mes-documents", label: "Mes documents", icon: FileSignature, clientOnly: true },
  { href: "/admin/users", label: "Administration", icon: ShieldCheck, adminOnly: true },
  { href: "/profil", label: "Mon profil", icon: UserCircle },
];

const dateLongueFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const dateCourteFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** Fil affiché dans la section Messagerie (chantier ou affaire). */
type FilResume = {
  cle: string;
  nom: string;
  href: string;
  type: "chantier" | "affaire";
  nonLus: number;
  dormante: boolean;
  activite: Date;
};

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
  const maintenant = new Date();
  // Les dates du planning sont des jours purs (@db.Date, minuit UTC) :
  // toutes les comparaisons se font sur le jour UTC courant.
  const aujourdhuiUtc = new Date(
    Date.UTC(
      maintenant.getFullYear(),
      maintenant.getMonth(),
      maintenant.getDate()
    )
  );
  const dans7Jours = new Date(aujourdhuiUtc);
  dans7Jours.setUTCDate(dans7Jours.getUTCDate() + 7);

  // ── Chantiers en cours (en-tête sobre), hors comptes client ──
  const nbChantiersEnCours = me.modules.includes("chantier")
    ? await db.chantier.count({
        where: {
          statut: "EN_COURS",
          archivedAt: null,
          ...chantierEspaceFilter(me),
        },
      })
    : 0;

  // ── Ma journée (équipe interne uniquement : le client garde le lanceur) ──
  let taches: TacheJournee[] = [];
  let nbRetard = 0;
  let nbAujourdhui = 0;
  let fils: FilResume[] = [];
  let totalNonLus = 0;

  if (!me.isClient) {
    // Mes tâches : les miennes (perso), celles affectées à l'ouvrier lié
    // à mon compte (Ouvrier.userId) et celles des affaires dont je suis
    // responsable. Fenêtre : tout ce qui a commencé (retard compris)
    // jusqu'à 7 jours devant.
    const rows = await db.tache.findMany({
      where: {
        deletedAt: null,
        statut: { in: ["A_FAIRE", "EN_COURS", "BLOQUEE"] },
        dateDebut: { lt: dans7Jours },
        OR: [
          { proprietaireId: me.id },
          { ouvriers: { some: { ouvrier: { userId: me.id } } } },
          { affaire: { responsableId: me.id } },
        ],
      },
      select: {
        id: true,
        nom: true,
        dateDebut: true,
        dateFin: true,
        priorite: true,
        chantier: { select: { id: true, nom: true } },
        affaire: { select: { id: true, titre: true } },
      },
      orderBy: [{ dateFin: "asc" }, { priorite: "asc" }],
      take: 40,
    });

    taches = rows.map((t) => {
      const enRetardDe = Math.round(
        (aujourdhuiUtc.getTime() - t.dateFin.getTime()) / 86_400_000
      );
      const groupe: TacheJournee["groupe"] =
        enRetardDe > 0
          ? "retard"
          : t.dateDebut <= aujourdhuiUtc
            ? "aujourdhui"
            : "semaine";
      return {
        id: t.id,
        nom: t.nom,
        groupe,
        echeance:
          groupe === "retard"
            ? `${enRetardDe} j de retard`
            : groupe === "aujourdhui"
              ? "aujourd'hui"
              : dateCourteFmt.format(t.dateDebut),
        contexte: t.chantier?.nom ?? t.affaire?.titre ?? null,
        contexteHref: t.chantier
          ? `/messagerie/${t.chantier.id}`
          : t.affaire
            ? `/messagerie/affaire/${t.affaire.id}`
            : null,
      };
    });
    // Ordre d'affichage : retard, aujourd'hui, semaine (le composant
    // groupe ; on garde ici le tri par échéance à l'intérieur).
    nbRetard = taches.filter((t) => t.groupe === "retard").length;
    nbAujourdhui = taches.filter((t) => t.groupe === "aujourdhui").length;

    // ── Messagerie : fils de chantiers et d'affaires, non-lus d'abord ──
    const accessibleIds = await getAccessibleChantierIds(me);
    const [unread, chantiersMsg] = await Promise.all([
      unreadMessagerieFor(me.id, accessibleIds),
      db.chantier.findMany({
        where: {
          archivedAt: null,
          ...(accessibleIds !== null ? { id: { in: accessibleIds } } : {}),
          ...chantierEspaceFilter(me),
        },
        select: { id: true, nom: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 12,
      }),
    ]);
    const affairesMsg = me.canPilot
      ? await db.affaire.findMany({
          where: { statut: "EN_COURS", ...espaceFilter(me) },
          select: {
            id: true,
            titre: true,
            statut: true,
            prochaineActionLe: true,
            etapeDepuis: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: "desc" },
          take: 12,
        })
      : [];
    const unreadAffaires = me.canPilot
      ? await unreadAffairesFor(
          me.id,
          affairesMsg.map((a) => a.id)
        )
      : { total: 0, byAffaire: {} as Record<string, number> };

    fils = [
      ...chantiersMsg.map<FilResume>((c) => ({
        cle: `chantier:${c.id}`,
        nom: c.nom,
        href: `/messagerie/${c.id}`,
        type: "chantier",
        nonLus: unread.byChantier[c.id] ?? 0,
        dormante: false,
        activite: c.updatedAt,
      })),
      ...affairesMsg.map<FilResume>((a) => ({
        cle: `affaire:${a.id}`,
        nom: a.titre,
        href: `/messagerie/affaire/${a.id}`,
        type: "affaire",
        nonLus: unreadAffaires.byAffaire[a.id] ?? 0,
        dormante: estDormante(a, maintenant) !== null,
        activite: a.updatedAt,
      })),
    ]
      .sort((a, b) => {
        if ((a.nonLus > 0) !== (b.nonLus > 0)) return a.nonLus > 0 ? -1 : 1;
        return b.activite.getTime() - a.activite.getTime();
      })
      .slice(0, 6);
    totalNonLus = unread.total + unreadAffaires.total;
  }

  return (
    <div>
      {/* En-tête sobre : le prénom, le jour, la charge en cours. */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Bonjour {prenom}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {dateLongueFmt.format(maintenant)}
          {me.espaceCourant
            ? ` · ${me.espaceCourant.nom}`
            : me.espaces.length > 1
              ? " · toutes les entreprises"
              : ""}
          {me.modules.includes("chantier") && !me.isClient
            ? ` · ${nbChantiersEnCours} chantier${nbChantiersEnCours > 1 ? "s" : ""} en cours`
            : ""}
        </p>
      </div>

      {!me.isClient && (
        <>
          {/* Compteurs sobres : le chiffre porte le signal, pas la tuile. */}
          <div className="mb-5 grid max-w-md grid-cols-3 gap-2">
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
              <div
                className={`text-lg font-bold tabular-nums ${
                  nbRetard > 0
                    ? "text-red-700 dark:text-red-400"
                    : "text-slate-900 dark:text-slate-100"
                }`}
              >
                {nbRetard}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                En retard
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
              <div className="text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {nbAujourdhui}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Aujourd&apos;hui
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
              <div
                className={`text-lg font-bold tabular-nums ${
                  totalNonLus > 0
                    ? "text-brand-700 dark:text-brand-400"
                    : "text-slate-900 dark:text-slate-100"
                }`}
              >
                {totalNonLus}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Non lus
              </div>
            </div>
          </div>

          {/* ── Mes tâches (ancre de la barre basse « Tâches ») ── */}
          <section id="taches" className="mb-6 scroll-mt-20">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Mes tâches
              </h2>
              <Link
                href="/planning"
                className="inline-flex items-center gap-0.5 text-xs text-slate-600 underline-offset-2 hover:underline dark:text-slate-400"
              >
                Tout le planning
                <ChevronRight size={13} />
              </Link>
            </div>
            <MesTaches taches={taches} />
          </section>

          {/* ── Messagerie : un tap pour ouvrir le fil ── */}
          <section className="mb-6">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Messagerie
              </h2>
              <Link
                href="/messagerie"
                className="inline-flex items-center gap-0.5 text-xs text-slate-600 underline-offset-2 hover:underline dark:text-slate-400"
              >
                Toute la messagerie
                <ChevronRight size={13} />
              </Link>
            </div>
            {fils.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 px-4 py-3 text-xs italic text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Aucun fil actif pour l&apos;instant.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                {fils.map((f) => (
                  <li key={f.cle}>
                    <Link
                      href={f.href}
                      className="flex items-center gap-2.5 px-3 py-2.5 transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-950 text-slate-50 dark:bg-slate-100 dark:text-slate-950">
                        {f.type === "affaire" ? (
                          <Handshake size={14} />
                        ) : (
                          <Hammer size={14} />
                        )}
                      </span>
                      <span className="flex min-w-0 flex-1 items-center gap-1.5">
                        {f.dormante && (
                          <span
                            className="h-2 w-2 shrink-0 rounded-full bg-brand-500"
                            title="Affaire dormante"
                            aria-label="Affaire dormante"
                          />
                        )}
                        <span className="truncate text-sm text-slate-800 dark:text-slate-200">
                          {f.nom}
                        </span>
                      </span>
                      {f.nonLus > 0 && (
                        <span className="inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[10px] font-bold leading-none text-white">
                          {f.nonLus}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {/* ── Lanceur d'applications (inchangé) : tuiles sombres, charte. ── */}
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
