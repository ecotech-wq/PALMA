import Link from "next/link";
import { redirect } from "next/navigation";
import { Handshake, Settings2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireAuth, espaceFilter } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import {
  estDormante,
  joursDansEtape,
  parseChecklist,
  valeurPipeline,
} from "@/lib/affaires";
import {
  accentPipeline,
  libelleEtapeDe,
  parseEtapes,
} from "@/lib/pipelines";
import { getPipelinesEspaces } from "@/lib/pipelines-server";
import { AffairesKanban, type AffaireCarte } from "./AffairesKanban";
import type { DocPiece } from "./FeuillePiece";
import { NouvelleAffaire } from "./NouvelleAffaire";

// ─── Affaires (CRM) : pipeline commercial par PROCÉDURE ─────────────────────
// Un kanban par procédure (pipeline éditable de l'entreprise) dont les
// colonnes sont ses étapes. Les onglets sont les procédures ACTIVES des
// espaces visibles, avec leur couleur d'accent et leur ordre choisis par
// l'utilisateur (/affaires/procedures). Les affaires closes (gagnées /
// perdues) vivent dans une vue repliée sous le plateau. Réservé aux pilotes
// (ADMIN + CONDUCTEUR), comme le suivi financier.

const eurosFmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default async function AffairesPage({
  searchParams,
}: {
  searchParams: Promise<{
    procedure?: string;
    typologie?: string;
    entreprise?: string;
  }>;
}) {
  const me = await requireAuth();
  if (!me.canPilot) redirect("/aujourdhui");
  const {
    procedure: procedureParam,
    typologie: typologieParam,
    entreprise: entrepriseParam,
  } = await searchParams;

  // Procédures des espaces visibles (seed paresseux des 4 modèles pour un
  // espace neuf). Seules les ACTIVES font des onglets.
  const pipelines = await getPipelinesEspaces(me.espaceIds);
  const actifs = pipelines.filter((p) => p.actif);

  // Filtre « entreprise » (chips, mode « tous » seulement : avec un espace
  // courant, le sélecteur global fait déjà ce travail). État porté par
  // l'URL pour le partage et le retour arrière ; un id hors des espaces de
  // l'utilisateur est IGNORÉ (les requêtes restent bornées par espaceFilter,
  // le paramètre ne fait que resserrer l'affichage).
  const espacesVisibles = me.espaceIds
    ? me.espaces.filter((e) => me.espaceIds!.includes(e.id))
    : me.espaces;
  const entrepriseId =
    entrepriseParam && espacesVisibles.some((e) => e.id === entrepriseParam)
      ? entrepriseParam
      : null;
  const onglets = entrepriseId
    ? actifs.filter((p) => p.espaceId === entrepriseId)
    : actifs;

  // Onglet courant : ?procedure=<id> d'abord, puis compat des anciens
  // liens ?typologie=<cle>, sinon la première procédure visible.
  const parId = new Map(onglets.map((p) => [p.id, p]));
  const courant =
    (procedureParam && parId.get(procedureParam)) ||
    (typologieParam && onglets.find((p) => p.cle === typologieParam)) ||
    onglets[0] ||
    null;

  const affaires = await db.affaire.findMany({
    where: { ...espaceFilter(me) },
    include: { responsable: { select: { name: true } } },
    orderBy: [{ etapeDepuis: "asc" }],
  });

  // Rattachement des affaires SANS pipeline (donnée antérieure au
  // backfill) : la procédure du même espace portant la clé de leur
  // typologie, comme la migration.
  const parEspaceEtCle = new Map(
    pipelines.map((p) => [`${p.espaceId}:${p.cle}`, p.id])
  );
  function pipelineIdDe(a: {
    pipelineId: string | null;
    espaceId: string;
    typologie: string;
  }): string | null {
    return (
      a.pipelineId ?? parEspaceEtCle.get(`${a.espaceId}:${a.typologie}`) ?? null
    );
  }

  const maintenant = new Date();

  // Compteurs des onglets : affaires EN COURS par procédure.
  const compteParPipeline = new Map<string, number>();
  for (const a of affaires) {
    if (a.statut !== "EN_COURS") continue;
    const pid = pipelineIdDe(a);
    if (pid) compteParPipeline.set(pid, (compteParPipeline.get(pid) ?? 0) + 1);
  }

  const etapes = courant ? parseEtapes(courant.etapes) : [];
  const enCours = courant
    ? affaires.filter(
        (a) => pipelineIdDe(a) === courant.id && a.statut === "EN_COURS"
      )
    : [];
  const closes = courant
    ? affaires.filter(
        (a) => pipelineIdDe(a) === courant.id && a.statut !== "EN_COURS"
      )
    : [];

  // Affaires closes des procédures DÉSACTIVÉES : leurs onglets n'existent
  // plus, la vue repliée par onglet ne les montrerait jamais et l'historique
  // deviendrait introuvable par navigation. Liste à part, bornée au filtre
  // entreprise courant comme les onglets, avec le nom de la procédure.
  const infoInactifs = new Map(
    pipelines
      .filter((p) => !p.actif && (!entrepriseId || p.espaceId === entrepriseId))
      .map((p) => [p.id, { libelle: p.libelle, etapes: parseEtapes(p.etapes) }])
  );
  const closesInactives = affaires.flatMap((a) => {
    if (a.statut === "EN_COURS") return [];
    const pid = pipelineIdDe(a);
    const procedure = pid ? infoInactifs.get(pid) : undefined;
    return procedure ? [{ affaire: a, procedure }] : [];
  });

  // Badges façon Trello sur les cartes : comptages agrégés en un nombre
  // CONSTANT de requêtes pour tout le plateau (groupBy / _count sur les ids
  // affichés, déjà bornés par l'espace via la requête ci-dessus), jamais un
  // aller-retour par carte.
  const idsEnCours = enCours.map((a) => a.id);
  const nbDocuments = new Map<string, number>();
  const nbPhotos = new Map<string, number>();
  const nbMessages = new Map<string, number>();
  // Couverture façon Trello : la photo la plus récente du dossier client
  // de chaque affaire (URL d'origine, la vignette calcule sa miniature).
  const couvertures = new Map<string, string>();
  // Documents validant une pièce de checklist, par affaire puis par clé :
  // la carte s'en sert comme le fil et la fiche (feuille « joindre »).
  const docsParAffaire = new Map<string, Record<string, DocPiece>>();
  if (idsEnCours.length > 0) {
    const [docsGroupes, photosDeposees, canaux, photosRecentes, docsChecklist] =
      await Promise.all([
      // Tout le dossier client (toutes catégories confondues).
      db.affaireDocument.groupBy({
        by: ["affaireId"],
        where: { affaireId: { in: idsEnCours } },
        _count: { _all: true },
      }),
      // Photos déposées directement au dossier (messageId null) : celles
      // rangées depuis le fil sont déjà comptées via les photos du canal,
      // les recompter ici les ferait apparaître deux fois.
      db.affaireDocument.groupBy({
        by: ["affaireId"],
        where: {
          affaireId: { in: idsEnCours },
          categorie: "PHOTOS",
          messageId: null,
        },
        _count: { _all: true },
      }),
      db.canal.findMany({
        where: { affaireId: { in: idsEnCours } },
        select: { id: true, affaireId: true },
      }),
      // Photos du dossier client, les plus récentes d'abord : UNE requête
      // pour tout le plateau (jamais une par carte). `distinct` borne le
      // volume rapatrié à UNE ligne par affaire (la plus récente, grâce au
      // tri) : une affaire à 200 photos n'en fait plus voyager que 1.
      db.affaireDocument.findMany({
        where: { affaireId: { in: idsEnCours }, categorie: "PHOTOS" },
        orderBy: { createdAt: "desc" },
        distinct: ["affaireId"],
        select: { affaireId: true, fichier: true },
      }),
      // Documents qui valident une pièce de checklist (le plus récent par
      // clé gagne : tri croissant, la dernière écriture écrase) : même
      // calcul que la fiche et le fil, pour que la checklist dépliée des
      // cartes ouvre la feuille « joindre le fichier » à bon escient.
      db.affaireDocument.findMany({
        where: { affaireId: { in: idsEnCours }, checklistCle: { not: null } },
        orderBy: { createdAt: "asc" },
        select: {
          affaireId: true,
          checklistCle: true,
          fichier: true,
          nom: true,
        },
      }),
    ]);
    for (const g of docsGroupes) nbDocuments.set(g.affaireId, g._count._all);
    for (const g of photosDeposees) nbPhotos.set(g.affaireId, g._count._all);
    for (const d of photosRecentes) couvertures.set(d.affaireId, d.fichier);
    for (const d of docsChecklist) {
      if (!d.checklistCle) continue;
      const parCle = docsParAffaire.get(d.affaireId) ?? {};
      parCle[d.checklistCle] = { url: d.fichier, nom: d.nom };
      docsParAffaire.set(d.affaireId, parCle);
    }

    const canalVersAffaire = new Map<string, string>();
    for (const c of canaux) {
      if (c.affaireId) canalVersAffaire.set(c.id, c.affaireId);
    }
    const canalIds = [...canalVersAffaire.keys()];
    if (canalIds.length > 0) {
      const [messagesGroupes, messagesAvecPhotos] = await Promise.all([
        // Messages humains du fil : les traces système (auteur null) ne
        // comptent pas, façon Trello (activité réelle, pas journal).
        db.journalMessage.groupBy({
          by: ["canalId"],
          where: { canalId: { in: canalIds }, authorId: { not: null } },
          _count: { _all: true },
        }),
        // Photos du fil : Prisma ne sait pas sommer les cardinalités d'un
        // tableau en groupBy ; on ne rapatrie que les messages qui EN ONT.
        db.journalMessage.findMany({
          where: { canalId: { in: canalIds }, photos: { isEmpty: false } },
          select: { canalId: true, photos: true },
        }),
      ]);
      for (const g of messagesGroupes) {
        const affId = g.canalId ? canalVersAffaire.get(g.canalId) : undefined;
        if (affId) {
          nbMessages.set(affId, (nbMessages.get(affId) ?? 0) + g._count._all);
        }
      }
      for (const m of messagesAvecPhotos) {
        const affId = m.canalId ? canalVersAffaire.get(m.canalId) : undefined;
        if (affId) {
          nbPhotos.set(affId, (nbPhotos.get(affId) ?? 0) + m.photos.length);
        }
      }
    }
  }

  const clesEtapes = new Set(etapes.map((e) => e.cle));
  const cartes: AffaireCarte[] = enCours.map((a) => {
    const checklist = parseChecklist(a.checklist);
    return {
      id: a.id,
      titre: a.titre,
      contactNom: a.contactNom,
      contactTel: a.contactTel,
      valeurEstimee: a.valeurEstimee === null ? null : Number(a.valeurEstimee),
      // Étape disparue de la procédure (donnée historique) : la carte est
      // ramenée à la PREMIÈRE colonne pour rester visible et déplaçable.
      etapeCle: clesEtapes.has(a.etapeCle)
        ? a.etapeCle
        : (etapes[0]?.cle ?? a.etapeCle),
      joursEtape: joursDansEtape(a.etapeDepuis, maintenant),
      dormante: estDormante(a, maintenant) !== null,
      responsable: a.responsable ? { name: a.responsable.name } : null,
      checklistFaits: checklist.filter((c) => c.fait).length,
      checklistTotal: checklist.length,
      nbDocuments: nbDocuments.get(a.id) ?? 0,
      nbPhotos: nbPhotos.get(a.id) ?? 0,
      nbMessages: nbMessages.get(a.id) ?? 0,
      couverture: couvertures.get(a.id) ?? null,
      // Pièces complètes : la carte les déplie et les coche sur place.
      checklist,
      docsChecklist: docsParAffaire.get(a.id) ?? {},
    };
  });

  // Valeur du pipeline courant (somme des valeurs estimées en cours).
  const parEtape = valeurPipeline(
    cartes.map((c) => ({ etapeCle: c.etapeCle, valeurEstimee: c.valeurEstimee }))
  );
  const totalPipeline = Object.values(parEtape).reduce((s, v) => s + v, 0);
  const nbDormantes = cartes.filter((c) => c.dormante).length;

  // Pilotes uniquement : le module Affaires est réservé aux ADMIN et
  // CONDUCTEUR (requireAffaireAccess) ; un CHEF responsable recevrait des
  // liens /affaires/... qui le redirigent vers « Aujourd'hui ».
  const responsables = await db.user.findMany({
    where: {
      status: "ACTIVE",
      role: { in: ["ADMIN", "CONDUCTEUR"] },
      ...(me.espaceIds
        ? { espaces: { some: { espaceId: { in: me.espaceIds } } } }
        : {}),
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // Créer une affaire = choisir une procédure ACTIVE de l'espace COURANT
  // (en mode « tous », le sélecteur d'espace tranche d'abord).
  const proceduresCreation = me.espaceCourant
    ? actifs
        .filter((p) => p.espaceId === me.espaceCourant!.id)
        .map((p) => ({ id: p.id, libelle: p.libelle }))
    : [];
  const procedureInitiale =
    courant && proceduresCreation.some((p) => p.id === courant.id)
      ? courant.id
      : (proceduresCreation[0]?.id ?? "");

  // En mode « tous » avec plusieurs entreprises, deux procédures homonymes
  // peuvent cohabiter : l'onglet précise alors son entreprise.
  const nomEspace = new Map(me.espaces.map((e) => [e.id, e.nom]));
  const plusieursEspaces =
    !me.espaceCourant && (me.espaceIds?.length ?? 2) > 1;

  return (
    <div>
      <PageHeader
        title="Affaires"
        description={
          <span>
            {enCours.length} en cours
            {totalPipeline > 0 && (
              <>
                {" "}
                · pipeline{" "}
                <span className="font-mono tabular-nums">
                  {eurosFmt.format(totalPipeline)} EUR
                </span>
              </>
            )}
            {nbDormantes > 0 && (
              <span className="font-medium text-brand-700 dark:text-brand-400">
                {" "}
                · {nbDormantes} dormante{nbDormantes > 1 ? "s" : ""}
              </span>
            )}
          </span>
        }
        action={
          <div className="flex items-center gap-2">
            {/* Lien discret vers l'atelier des procédures (pilotes). */}
            <Link
              href="/affaires/procedures"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 px-2.5 text-sm text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
            >
              <Settings2 size={15} />
              <span className="hidden sm:inline">Procédures</span>
              <span className="sr-only sm:hidden">Procédures</span>
            </Link>
            <NouvelleAffaire
              procedures={proceduresCreation}
              procedureInitiale={procedureInitiale}
              responsables={responsables}
            />
          </div>
        }
      />

      {/* Chips « entreprise » (mode « tous » seulement) : resserrent les
          onglets aux procédures d'une seule entreprise. Même vocabulaire
          visuel que le sélecteur d'espace (initiale sur la couleur de
          l'entreprise, donnée d'espace, pas un hex décoratif). */}
      {plusieursEspaces && espacesVisibles.length > 1 && (
        <div className="-mx-1 mb-2 flex items-center gap-1.5 overflow-x-auto px-1">
          <Link
            href="/affaires"
            aria-current={!entrepriseId ? "true" : undefined}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm transition",
              !entrepriseId
                ? "border-slate-900 bg-slate-950 font-medium text-slate-50 dark:border-slate-200 dark:bg-slate-100 dark:text-slate-950"
                : "border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            )}
          >
            Toutes
          </Link>
          {espacesVisibles.map((e) => {
            const actif = entrepriseId === e.id;
            return (
              <Link
                key={e.id}
                href={`/affaires?entreprise=${e.id}`}
                aria-current={actif ? "true" : undefined}
                className={cn(
                  "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border py-1 pl-1.5 pr-3.5 text-sm transition",
                  actif
                    ? "border-slate-900 bg-slate-950 font-medium text-slate-50 dark:border-slate-200 dark:bg-slate-100 dark:text-slate-950"
                    : "border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                )}
              >
                {/* Initiale sur la couleur de l'entreprise (même repli
                    sobre que le sélecteur d'espace). */}
                <span
                  aria-hidden="true"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                  style={{ backgroundColor: e.couleur ?? "#6e6a63" }}
                >
                  {e.nom.trim().charAt(0).toUpperCase() || "?"}
                </span>
                {e.nom}
              </Link>
            );
          })}
        </div>
      )}

      {/* Onglets de procédure (état porté par l'URL, motif Onglets), avec
          la pastille d'accent de chaque procédure (palette nommée). Le
          filtre entreprise est conservé dans chaque lien. */}
      <nav
        aria-label="Procédures"
        className="-mx-1 mb-4 flex items-end gap-1 overflow-x-auto border-b border-slate-200 px-1 dark:border-slate-800"
      >
        {onglets.map((p) => {
          const accent = accentPipeline(p.couleur);
          const estActif = courant?.id === p.id;
          return (
            <Link
              key={p.id}
              href={`/affaires?${
                entrepriseId ? `entreprise=${entrepriseId}&` : ""
              }procedure=${p.id}`}
              aria-current={estActif ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-t-md border-b-2 px-3 py-2 text-sm transition-colors",
                estActif
                  ? `${accent.bordure} ${accent.texte} bg-slate-500/5 font-medium`
                  : "border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              )}
            >
              <span
                aria-hidden="true"
                className={`h-2 w-2 shrink-0 rounded-full ${accent.pastille}`}
              />
              {p.libelle}
              {plusieursEspaces && !entrepriseId && (
                <span className="text-xs text-slate-400">
                  {nomEspace.get(p.espaceId) ?? ""}
                </span>
              )}
              <span className="tabular-nums text-xs text-slate-400">
                ({compteParPipeline.get(p.id) ?? 0})
              </span>
            </Link>
          );
        })}
      </nav>

      {!courant ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-14 text-center dark:border-slate-700">
          <Handshake size={28} className="mx-auto mb-2 text-slate-400" />
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Aucune procédure active pour l&apos;instant.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Créez ou réactivez une procédure depuis l&apos;atelier «
            Procédures ».
          </p>
        </div>
      ) : etapes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-14 text-center dark:border-slate-700">
          <Handshake size={28} className="mx-auto mb-2 text-slate-400" />
          <p className="text-sm text-slate-600 dark:text-slate-400">
            La procédure « {courant.libelle} » n&apos;a aucune étape.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Ajoutez ses étapes depuis l&apos;atelier « Procédures ».
          </p>
        </div>
      ) : (
        // Le plateau se montre même vide : « + Ajouter une affaire » au
        // pied de chaque colonne fait naître la première carte sur place.
        <AffairesKanban
          affaires={cartes}
          etapes={etapes}
          canEdit={me.canPilot}
          pipelineId={courant.id}
          accent={accentPipeline(courant.couleur)}
        />
      )}

      {/* Affaires closes : vue repliée, hors du plateau. */}
      {closes.length > 0 && (
        <details className="mt-5 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-200">
            Terminées ({closes.length})
          </summary>
          <ul className="divide-y divide-slate-100 border-t border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {closes.map((a) => (
              <LigneAffaireClose
                key={a.id}
                id={a.id}
                titre={a.titre}
                contactNom={a.contactNom}
                etiquette={libelleEtapeDe(etapes, a.etapeCle)}
                quand={a.updatedAt}
                statut={a.statut}
                motifPerte={a.statut === "PERDUE" ? a.motifPerte : null}
                valeur={
                  a.valeurEstimee === null ? null : Number(a.valeurEstimee)
                }
              />
            ))}
          </ul>
        </details>
      )}

      {/* Closes des procédures désactivées : l'historique reste navigable
          même quand l'onglet de la procédure a disparu. */}
      {closesInactives.length > 0 && (
        <details className="mt-3 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-200">
            Terminées de procédures désactivées ({closesInactives.length})
          </summary>
          <ul className="divide-y divide-slate-100 border-t border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {closesInactives.map(({ affaire: a, procedure }) => (
              <LigneAffaireClose
                key={a.id}
                id={a.id}
                titre={a.titre}
                contactNom={a.contactNom}
                etiquette={`${procedure.libelle} · ${libelleEtapeDe(
                  procedure.etapes,
                  a.etapeCle
                )}`}
                quand={a.updatedAt}
                statut={a.statut}
                motifPerte={a.statut === "PERDUE" ? a.motifPerte : null}
                valeur={
                  a.valeurEstimee === null ? null : Number(a.valeurEstimee)
                }
              />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Ligne d'une affaire close (vues repliées « Terminées ») : partagée entre
 *  la liste de l'onglet courant et celle des procédures désactivées. */
function LigneAffaireClose({
  id,
  titre,
  contactNom,
  etiquette,
  quand,
  statut,
  motifPerte,
  valeur,
}: {
  id: string;
  titre: string;
  contactNom: string;
  /** Segment médian : « Étape », ou « Procédure · Étape ». */
  etiquette: string;
  quand: Date;
  statut: string;
  motifPerte: string | null;
  valeur: number | null;
}) {
  return (
    <li>
      <Link
        href={`/affaires/${id}`}
        className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
            {titre}
          </div>
          <div className="truncate text-xs text-slate-500">
            {contactNom || "Contact à compléter"} · {etiquette} ·{" "}
            {dateFmt.format(quand)}
            {motifPerte ? ` · ${motifPerte}` : ""}
          </div>
        </div>
        {valeur !== null && (
          <span className="hidden font-mono text-xs tabular-nums text-slate-500 sm:block">
            {eurosFmt.format(valeur)} EUR
          </span>
        )}
        {statut === "GAGNEE" ? (
          <Badge color="green">Gagnée</Badge>
        ) : (
          <Badge color="red">Perdue</Badge>
        )}
      </Link>
    </li>
  );
}
