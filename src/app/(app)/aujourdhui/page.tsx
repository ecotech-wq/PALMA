import Link from "next/link";
import { ChevronRight, Handshake, Hammer, LayoutGrid } from "lucide-react";
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
import { ClientDashboard } from "./ClientDashboard";

// ─── Aujourd'hui : « Ma journée » ────────────────────────────────────────────
// L'écran d'atterrissage de LYNX. En tête, les tâches de l'utilisateur
// (en retard en terracotta, puis aujourd'hui, puis 7 jours) avec la case
// à cocher rapide du planning ; puis la messagerie (fils de chantiers et
// d'affaires avec leurs non-lus, un tap pour ouvrir). Le lanceur
// d'applications vit sur /accueil (onglet « Accueil »). Compact et pensé
// téléphone d'abord ; l'ambre reste réservé au signal.
//
// Les comptes CLIENT reçoivent ici leur vue dédiée (ClientDashboard) :
// même point d'atterrissage pour tous, contenu par rôle.

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

export default async function AujourdhuiPage() {
  const me = await requireAuth();

  // Le client garde une expérience équivalente : sa vue dédiée (ses
  // chantiers, rapports reçus, incidents, documents à signer) est servie
  // ici même, sans redirection supplémentaire.
  if (me.isClient) {
    return <ClientDashboard userId={me.id} userName={me.name} />;
  }

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

  // ── Chantiers en cours (en-tête sobre) ──
  const nbChantiersEnCours = me.modules.includes("chantier")
    ? await db.chantier.count({
        where: {
          statut: "EN_COURS",
          archivedAt: null,
          ...chantierEspaceFilter(me),
        },
      })
    : 0;

  // ── Mes tâches : les miennes (perso), celles affectées à l'ouvrier lié
  // à mon compte (Ouvrier.userId) et celles des affaires dont je suis
  // responsable. Fenêtre : tout ce qui a commencé (retard compris)
  // jusqu'à 7 jours devant. ──
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

  const taches: TacheJournee[] = rows.map((t) => {
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
  const nbRetard = taches.filter((t) => t.groupe === "retard").length;
  const nbAujourdhui = taches.filter((t) => t.groupe === "aujourdhui").length;

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

  const fils: FilResume[] = [
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
  const totalNonLus = unread.total + unreadAffaires.total;

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
          {me.modules.includes("chantier")
            ? ` · ${nbChantiersEnCours} chantier${nbChantiersEnCours > 1 ? "s" : ""} en cours`
            : ""}
        </p>
      </div>

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

      {/* Passerelle discrète vers le lanceur : le lanceur lui-même vit sur
          /accueil, on n'en duplique rien ici. */}
      <Link
        href="/accueil"
        className="inline-flex items-center gap-2 text-xs text-slate-500 underline-offset-2 hover:underline dark:text-slate-400"
      >
        <LayoutGrid size={14} />
        Toutes les applications
      </Link>
    </div>
  );
}
