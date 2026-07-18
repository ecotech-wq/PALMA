import Link from "next/link";
import { MessageSquare, Hammer, Handshake, Pin } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import {
  requireAuth,
  getAccessibleChantierIds,
  chantierEspaceFilter,
  espaceFilter,
} from "@/lib/auth-helpers";
import { unreadMessagerieFor, unreadAffairesFor } from "@/lib/read-state";
import { estDormante } from "@/lib/affaires";
import {
  etapesParDefautDeTypologie,
  libelleEtapeDe,
  parseEtapes,
} from "@/lib/pipelines";
import { getPipelinesEspace } from "@/lib/pipelines-server";
import { NouveauBouton } from "./NouveauBouton";
import { PinChantierButton } from "./PinChantierButton";

const timeFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const todayFmt = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
});

/* ─── Accents de section du hub (tokens à UN seul endroit) ──────────────────
 * L'ambre léger signe la section Affaires (le commercial), le gris-bleu la
 * section Chantiers (le terrain) : pastille de titre, liseré gauche de la
 * liste et teinte d'avatar, rien de plus. Changer un accent se fait ici. */
const ACCENTS_HUB = {
  affaires: {
    pastille: "bg-brand-500 dark:bg-brand-400",
    lisere: "border-l-2 border-l-brand-300 dark:border-l-brand-700",
    avatar:
      "bg-brand-100 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300",
  },
  chantiers: {
    pastille: "bg-slate-400 dark:bg-slate-500",
    lisere: "border-l-2 border-l-slate-300 dark:border-l-slate-600",
    avatar: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  },
} as const;

/** Met en forme un timestamp : aujourd'hui = juste l'heure, sinon date courte */
function smartTime(d: Date | string): string {
  const dt = new Date(d);
  const today = new Date();
  if (
    dt.getFullYear() === today.getFullYear() &&
    dt.getMonth() === today.getMonth() &&
    dt.getDate() === today.getDate()
  ) {
    return todayFmt.format(dt);
  }
  return timeFmt.format(dt);
}

/**
 * Hub de la messagerie : liste des chantiers accessibles à l'utilisateur,
 * style WhatsApp. Pour chaque chantier on affiche le dernier message
 * + un compteur de non-lus (pas implémenté ici en tant que tel, mais
 * la structure le permet).
 *
 * Clic sur un chantier → /messagerie/[id] qui ouvre le fil.
 */
export default async function MessagerieHubPage() {
  const me = await requireAuth();
  if (me.isClient) {
    // Les clients n'ont pas accès à la messagerie interne
    const { redirect } = await import("next/navigation");
    redirect("/aujourdhui");
  }

  const accessibleIds = await getAccessibleChantierIds(me);
  const [unread, pins] = await Promise.all([
    unreadMessagerieFor(me.id, accessibleIds),
    db.userChantierPin.findMany({
      where: { userId: me.id },
      select: { chantierId: true, pinnedAt: true },
    }),
  ]);
  const pinnedAt = new Map(pins.map((p) => [p.chantierId, p.pinnedAt]));
  const chantiers = await db.chantier.findMany({
    where: {
      archivedAt: null,
      ...(accessibleIds !== null ? { id: { in: accessibleIds } } : {}),
      // Socle espaces : le hub ne montre que l'espace courant.
      ...chantierEspaceFilter(me),
    },
    select: {
      id: true,
      nom: true,
      adresse: true,
      statut: true,
      chef: { select: { name: true } },
      journalMessages: {
        select: {
          id: true,
          type: true,
          texte: true,
          photos: true,
          videos: true,
          audios: true,
          documents: true,
          createdAt: true,
          author: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      _count: {
        select: {
          journalMessages: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  // ── Affaires (CRM) : les fils du pipeline commercial, réservés aux
  // pilotes. Même mécanique que les chantiers : dernier message, badge
  // non-lus (clé « affaire:<id> »), pastille ambre quand l'affaire dort.
  const maintenant = new Date();
  const affaires = me.canPilot
    ? await db.affaire.findMany({
        where: { statut: "EN_COURS", ...espaceFilter(me) },
        select: {
          id: true,
          titre: true,
          typologie: true,
          // La procédure porte le libellé et les étapes affichés (les
          // pipelines sont des données par entreprise depuis 2026-07-18).
          pipeline: { select: { libelle: true, etapes: true } },
          etapeCle: true,
          etapeDepuis: true,
          statut: true,
          prochaineActionLe: true,
          contactNom: true,
          updatedAt: true,
          canaux: {
            orderBy: { createdAt: "asc" },
            take: 1,
            select: {
              id: true,
              messages: {
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                take: 1,
                select: {
                  texte: true,
                  photos: true,
                  audios: true,
                  documents: true,
                  createdAt: true,
                  author: { select: { name: true } },
                },
              },
            },
          },
        },
      })
    : [];
  const unreadAffaires = me.canPilot
    ? await unreadAffairesFor(
        me.id,
        affaires.map((a) => a.id)
      )
    : { total: 0, byAffaire: {} as Record<string, number> };

  const affairesTriees = affaires
    .map((a) => {
      const dernier = a.canaux[0]?.messages[0] ?? null;
      return {
        ...a,
        dernier,
        dormante: estDormante(a, maintenant) !== null,
        lastActivity: dernier?.createdAt ?? a.updatedAt,
      };
    })
    .sort(
      (a, b) =>
        new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
    );

  // Tri : épinglés (par pinnedAt desc) en tête, puis non-épinglés (par
  // dernière activité desc).
  const sorted = chantiers
    .map((c) => ({
      ...c,
      lastActivity: c.journalMessages[0]?.createdAt ?? new Date(0),
      isPinned: pinnedAt.has(c.id),
      pinnedAt: pinnedAt.get(c.id) ?? null,
    }))
    .sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      if (a.isPinned && b.isPinned) {
        return (
          new Date(b.pinnedAt!).getTime() - new Date(a.pinnedAt!).getTime()
        );
      }
      return (
        new Date(b.lastActivity).getTime() -
        new Date(a.lastActivity).getTime()
      );
    });

  // Procédures actives de l'espace courant : la feuille de création
  // d'affaire du bouton « + Nouveau » propose leur choix.
  const proceduresCreation =
    me.canPilot && me.espaceCourant
      ? (await getPipelinesEspace(me.espaceCourant.id))
          .filter((p) => p.actif)
          .map((p) => ({ id: p.id, libelle: p.libelle }))
      : [];

  return (
    <div>
      <PageHeader
        title="Messagerie"
        description="Le centre de travail : fils des affaires et des chantiers, actions et médias au même endroit."
        action={
          // « + Nouveau » : affaire (pilotes) ou chantier (admin global,
          // même gating que la page /chantiers). Feuille à deux choix.
          <NouveauBouton
            peutCreerAffaire={me.canPilot}
            peutCreerChantier={me.isGlobalAdmin && !!me.espaceCourant}
            procedures={proceduresCreation}
          />
        }
      />

      {/* ── Affaires (CRM) : au-dessus des chantiers, car c'est là que se
          joue la journée commerciale. Réservé aux pilotes. */}
      {me.canPilot && (
        <section className="mb-5">
          {/* La création vit dans le bouton « + Nouveau » de l'en-tête
              (affaire OU chantier) : plus de bouton par section. */}
          <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${ACCENTS_HUB.affaires.pastille}`}
            />
            Affaires ({affairesTriees.length})
          </h2>
          {affairesTriees.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 px-4 py-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Aucune affaire en cours. Chaque appel entrant mérite une
              carte : créez la première.
            </p>
          ) : (
            <ul
              className={`divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900 ${ACCENTS_HUB.affaires.lisere}`}
            >
              {affairesTriees.map((a) => {
                // Libellés portés par la procédure de l'affaire ; repli sur
                // le modèle par défaut de la typologie (donnée antérieure).
                const etapesAffaire = a.pipeline
                  ? parseEtapes(a.pipeline.etapes)
                  : etapesParDefautDeTypologie(a.typologie);
                const nomProcedure = a.pipeline?.libelle ?? a.typologie;
                const dernier = a.dernier;
                const apercu = dernier
                  ? (dernier.texte?.slice(0, 100) ?? "") ||
                    (dernier.photos.length > 0
                      ? `Photo${dernier.photos.length > 1 ? "s" : ""}`
                      : dernier.audios.length > 0
                        ? "Mémo vocal"
                        : Array.isArray(dernier.documents) &&
                            dernier.documents.length > 0
                          ? "Pièce jointe"
                          : "[média]")
                  : null;
                const nonLus = unreadAffaires.byAffaire[a.id] ?? 0;
                return (
                  <li key={a.id}>
                    <Link
                      href={`/messagerie/affaire/${a.id}`}
                      className="flex items-start gap-3 p-3 transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      {/* Avatar : ambre léger, l'accent de la section
                          Affaires (la pastille bg-brand-500 pleine reste
                          réservée au signal « dormante »). */}
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${ACCENTS_HUB.affaires.avatar}`}
                      >
                        <Handshake size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-1.5 truncate font-semibold text-slate-900 dark:text-slate-100">
                            {a.dormante && (
                              <span
                                className="h-2 w-2 shrink-0 rounded-full bg-brand-500"
                                title="Affaire dormante : action en retard ou aucune action planifiée"
                                aria-label="Affaire dormante"
                              />
                            )}
                            <span className="truncate">{a.titre}</span>
                          </span>
                          <span className="shrink-0 text-[11px] text-slate-500 dark:text-slate-400">
                            {dernier ? smartTime(dernier.createdAt) : "Nouvelle"}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-slate-600 dark:text-slate-400">
                          {dernier ? (
                            <>
                              {dernier.author?.name ? (
                                <span className="font-medium">
                                  {dernier.author.name}
                                </span>
                              ) : (
                                <span className="italic">Système</span>
                              )}
                              {" : "}
                              {apercu || <span className="italic">[média]</span>}
                            </>
                          ) : (
                            <span className="italic">
                              Aucun message : démarrez la discussion
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-slate-400 dark:text-slate-500">
                          {nomProcedure} ·{" "}
                          {libelleEtapeDe(etapesAffaire, a.etapeCle)} ·{" "}
                          {a.contactNom || "Contact à compléter"}
                        </p>
                      </div>
                      {nonLus > 0 && (
                        <span className="inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[10px] font-bold leading-none text-white">
                          {nonLus}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {me.canPilot && (
        <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full ${ACCENTS_HUB.chantiers.pastille}`}
          />
          Chantiers ({sorted.length})
        </h2>
      )}

      {sorted.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={MessageSquare}
              title="Aucun chantier accessible"
              description="Aucun chantier actif. Crée un chantier pour démarrer un fil de discussion."
              action={
                <Link href="/chantiers/nouveau">
                  <button className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-brand-600 text-white text-sm hover:bg-brand-700">
                    Nouveau chantier
                  </button>
                </Link>
              }
            />
          </CardBody>
        </Card>
      ) : (
        <ul
          className={`bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden ${ACCENTS_HUB.chantiers.lisere}`}
        >
          {sorted.map((c, idx) => {
            // Séparateur visuel entre épinglés et le reste
            const prevPinned = idx > 0 ? sorted[idx - 1].isPinned : false;
            const showSeparator = prevPinned && !c.isPinned;
            const last = c.journalMessages[0];
            const lastPreview = last
              ? (last.texte?.slice(0, 100) ?? "") ||
                (last.photos.length > 0
                  ? `📷 ${last.photos.length} photo${last.photos.length > 1 ? "s" : ""}`
                  : last.videos.length > 0
                    ? `🎥 vidéo`
                    : last.audios.length > 0
                      ? "Mémo vocal"
                      : Array.isArray(last.documents) && last.documents.length > 0
                        ? "Pièce jointe"
                        : "[média]")
              : null;
            const typeLabel = last
              ? (
                  {
                    NOTE: "",
                    SYSTEM_INCIDENT: "⚠️ ",
                    SYSTEM_INCIDENT_RESOLU: "✅ ",
                    SYSTEM_DEMANDE: "📦 ",
                    SYSTEM_COMMANDE: "🛒 ",
                    SYSTEM_COMMANDE_LIVREE: "📦✓ ",
                    SYSTEM_RAPPORT: "📝 ",
                    SYSTEM_SORTIE: "📤 ",
                    SYSTEM_RETOUR: "📥 ",
                    SYSTEM_LOCATION: "🚚 ",
                    SYSTEM_LOCATION_FIN: "🏁 ",
                    SYSTEM_PLAN: "📐 ",
                    BILAN_JOURNEE: "🏁 ",
                  } as Record<string, string>
                )[last.type] || ""
              : "";
            return (
              <li key={c.id} className="relative">
                {showSeparator && (
                  <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/50 border-y border-slate-100 dark:border-slate-800">
                    Autres chantiers
                  </div>
                )}
                <Link
                  href={`/messagerie/${c.id}`}
                  className={`flex items-start gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition ${c.isPinned ? "bg-amber-50/30 dark:bg-amber-950/10" : ""}`}
                >
                  {/* Avatar : gris-bleu, l'accent de la section Chantiers
                      (l'ambre appartient à la section Affaires). */}
                  <div
                    className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm ${ACCENTS_HUB.chantiers.avatar}`}
                  >
                    <Hammer size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900 dark:text-slate-100 truncate flex items-center gap-1">
                        {c.isPinned && (
                          <Pin
                            size={11}
                            className="text-amber-500 fill-current shrink-0"
                          />
                        )}
                        {c.nom}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                        {last
                          ? smartTime(last.createdAt)
                          : c.statut === "PLANIFIE"
                            ? "À démarrer"
                            : "-"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 truncate mt-0.5">
                      {last ? (
                        <>
                          {typeLabel}
                          {last.author?.name ? (
                            <span className="font-medium">
                              {last.author.name}
                            </span>
                          ) : (
                            <span className="italic">Système</span>
                          )}
                          {" : "}
                          {lastPreview || <span className="italic">[média]</span>}
                        </>
                      ) : (
                        <span className="italic">Aucun message : démarre la conversation</span>
                      )}
                    </p>
                    {c.adresse && (
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                        {c.adresse}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    {(unread.byChantier[c.id] ?? 0) > 0 ? (
                      <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-brand-600 text-white text-[10px] font-bold leading-none">
                        {unread.byChantier[c.id]}
                      </span>
                    ) : c._count.journalMessages > 0 ? (
                      <Badge color="slate">{c._count.journalMessages}</Badge>
                    ) : null}
                    <PinChantierButton
                      chantierId={c.id}
                      pinned={c.isPinned}
                    />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
