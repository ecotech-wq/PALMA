import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Hash, Settings2 } from "lucide-react";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { Card, CardBody } from "@/components/ui/Card";
import { ChantierComposer } from "../ChantierComposer";
import { ChantierFeed } from "../ChantierFeed";
import { CompileRapportButton } from "../CompileRapportButton";
import { RubriquesPanel, type Rubrique } from "../ChantierRubriques";
import { ChantierInfoSheet } from "../ChantierInfoSheet";
import { documentsChantier } from "../chantier-documents";
import { requireAuth, requireChantierAccess, espaceFilter } from "@/lib/auth-helpers";
import { markResourceRead } from "@/lib/read-state";
import { getPhotoMetadata } from "@/lib/upload";
import {
  listChannelsFor,
  getOrCreateGeneral,
  ChannelBar,
  readResourceKey,
} from "@/features/messaging";

/**
 * Le fil d'un chantier — écran de messagerie pensé téléphone d'abord
 * (l'app vit sur le terrain) : en-tête compact, canaux en onglets
 * défilants, rubriques en pastilles, fil plein écran, composer au pouce.
 * Sur grand écran, la disposition de la maquette v4 : rail des canaux et
 * documents à gauche, fil au centre, rubriques du chantier à droite.
 */
export default async function MessagerieChantierPage({
  params,
  searchParams,
}: {
  params: Promise<{ chantierId: string }>;
  searchParams: Promise<{ canal?: string }>;
}) {
  const { chantierId } = await params;
  const { canal } = await searchParams;
  const me = await requireAuth();
  if (me.isClient) redirect("/dashboard");
  await requireChantierAccess(me, chantierId);

  // v4.2 : canaux du chantier. On garantit le canal "Général" puis on
  // choisit le canal actif (paramètre d'URL, sinon le premier visible).
  const general = await getOrCreateGeneral(chantierId);
  const channels = await listChannelsFor(me, chantierId);
  const activeCanalId =
    canal && channels.some((c) => c.id === canal) ? canal : (channels[0]?.id ?? general.id);
  const activeChannel = channels.find((c) => c.id === activeCanalId) ?? general;
  const isGeneralActive = activeCanalId === general.id;

  // Marque le canal actif comme lu (badge sidebar décrémenté à la prochaine nav)
  await markResourceRead(me.id, readResourceKey(chantierId, activeCanalId));

  // Fenêtre par défaut : 14 derniers jours
  const now = new Date();
  const since = new Date(now);
  since.setDate(since.getDate() - 14);
  since.setHours(0, 0, 0, 0);

  const tachesActivesWhere: Prisma.TacheWhereInput = {
    chantierId,
    deletedAt: null,
    statut: { in: ["A_FAIRE", "EN_COURS", "BLOQUEE"] },
  };
  const reservesOuvertesWhere: Prisma.PvReserveWhereInput = {
    leveLe: null,
    pv: { chantierId },
  };

  const [
    chantier,
    messages,
    materiels,
    equipes,
    sortiesOuvertes,
    demandesStatuts,
    incidentsOuverts,
    incidentsCount,
    tachesActives,
    tachesCount,
    reservesOuvertes,
    reservesCount,
  ] = await Promise.all([
    db.chantier.findUnique({
      where: { id: chantierId },
      select: {
        id: true,
        nom: true,
        adresse: true,
        chef: { select: { id: true, name: true } },
      },
    }),
    db.journalMessage.findMany({
      where: {
        chantierId,
        createdAt: { gte: since },
        // Canal actif ; les messages historiques sans canal restent au Général
        ...(isGeneralActive
          ? { OR: [{ canalId: activeCanalId }, { canalId: null }] }
          : { canalId: activeCanalId }),
      },
      include: {
        author: { select: { id: true, name: true, role: true } },
        reactions: {
          select: { emoji: true, userId: true },
        },
        tags: { select: { tagCode: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.materiel.findMany({
      where: { statut: { in: ["DISPO", "SORTI"] } },
      select: { id: true, nomCommun: true, statut: true },
      orderBy: { nomCommun: "asc" },
    }),
    db.equipe.findMany({
      where: {
        OR: [{ chantierId }, { chantierId: null }],
        ...espaceFilter(me),
      },
      select: { id: true, nom: true },
      orderBy: { nom: "asc" },
    }),
    db.sortieMateriel.findMany({
      where: {
        chantierId,
        dateRetour: null,
      },
      select: {
        id: true,
        dateSortie: true,
        materiel: { select: { nomCommun: true } },
      },
      orderBy: { dateSortie: "desc" },
    }),
    // Statuts des demandes liées aux messages affichés — pour pouvoir
    // afficher (ou masquer) les boutons « Approuver / Refuser »
    db.demandeMateriel.findMany({
      where: { chantierId },
      select: { id: true, statut: true, description: true, quantite: true, unite: true },
    }),
    // Rubriques du chantier (v4.2) : les fiches créées par les tags et
    // les modules, vues depuis la messagerie
    db.incident.findMany({
      where: { chantierId, statut: { not: "RESOLU" } },
      select: { id: true, titre: true },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
    db.incident.count({ where: { chantierId, statut: { not: "RESOLU" } } }),
    db.tache.findMany({
      where: tachesActivesWhere,
      select: { id: true, nom: true },
      orderBy: { updatedAt: "desc" },
      take: 3,
    }),
    db.tache.count({ where: tachesActivesWhere }),
    db.pvReserve.findMany({
      where: reservesOuvertesWhere,
      select: { id: true, numero: true, texte: true },
      orderBy: { numero: "asc" },
      take: 3,
    }),
    db.pvReserve.count({ where: reservesOuvertesWhere }),
  ]);
  if (!chantier) notFound();

  const rubriques: Rubrique[] = [
    {
      key: "incidents",
      label: "Incidents",
      count: incidentsCount,
      href: `/incidents?chantier=${chantierId}`,
      fiches: incidentsOuverts.map((i) => ({
        id: i.id,
        titre: i.titre,
        href: `/incidents/${i.id}`,
      })),
    },
    {
      key: "taches",
      label: "Tâches",
      count: tachesCount,
      href: `/planning?chantier=${chantierId}`,
      fiches: tachesActives.map((t) => ({
        id: t.id,
        titre: t.nom,
        href: `/planning?chantier=${chantierId}`,
      })),
    },
    {
      key: "reserves",
      label: "Réserves",
      count: reservesCount,
      href: "/pv-reception",
      fiches: reservesOuvertes.map((r) => ({
        id: r.id,
        titre: `R${r.numero} : ${r.texte}`,
        href: "/pv-reception",
      })),
    },
  ];

  const documents = documentsChantier(chantierId);

  const sortiesForComposer = sortiesOuvertes.map((s) => ({
    id: s.id,
    materielNom: s.materiel.nomCommun,
    dateSortie: s.dateSortie,
  }));

  // Charge les métadonnées EXIF (GPS, date prise vue) pour toutes les
  // photos visibles dans le fil — affiché dans le lightbox
  const allPhotoUrls = messages.flatMap((m) => m.photos);
  const photoMeta =
    allPhotoUrls.length > 0 ? await getPhotoMetadata(allPhotoUrls) : {};

  // Map demandeId -> info pour le feed
  const demandeInfo: Record<
    string,
    { statut: string; description: string; quantite: number; unite: string | null }
  > = {};
  for (const d of demandesStatuts) {
    demandeInfo[d.id] = {
      statut: d.statut,
      description: d.description,
      quantite: Number(d.quantite),
      unite: d.unite,
    };
  }

  const visibilityLabel =
    activeChannel.visibility === "CLIENT"
      ? "ouvert au client"
      : activeChannel.visibility === "SOUS_TRAITANT"
        ? "ouvert au sous-traitant"
        : "interne";

  const channelBarProps = {
    projectId: chantierId,
    channels,
    activeId: activeCanalId,
    hrefBase: `/messagerie/${chantierId}`,
    user: { isAdmin: me.isAdmin, isConducteur: me.isConducteur },
  };

  return (
    // Hauteur : plein écran utile. Au téléphone, 131px de chrome (barre
    // haute 53 + marge 16 + barre basse 54 + 8 de respiration) ; le -mb-28
    // annule le rembourrage bas du gabarit pour que la page ne défile pas.
    // min-h bas (280px) : clavier virtuel ouvert, le 100dvh peut tomber
    // vers 400-500px ; un minimum trop haut pousserait le composer sous
    // la barre de navigation basse.
    <div className="flex h-[calc(100dvh-131px)] md:h-[calc(100vh-64px)] min-h-[280px] flex-col -mb-28 md:mb-0">
      {/* En-tête compact : une seule ligne, lisible au téléphone */}
      <div className="mb-2 flex shrink-0 items-center gap-2 md:mb-3">
        <Link
          href="/messagerie"
          aria-label="Retour à la messagerie"
          className="shrink-0 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <ChevronLeft size={18} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold text-slate-900 dark:text-slate-100 md:text-xl">
            {chantier.nom}
          </h1>
          {chantier.adresse && (
            <p className="hidden truncate text-xs text-slate-500 dark:text-slate-400 md:block">
              {chantier.adresse}
            </p>
          )}
        </div>
        {(me.isAdmin || me.isConducteur) && (
          <CompileRapportButton chantierId={chantierId} />
        )}
        <Link
          href={`/chantiers/${chantierId}`}
          title="Fiche chantier"
          className="hidden shrink-0 items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 sm:inline-flex"
        >
          <Settings2 size={14} />
          Fiche chantier
        </Link>
        {/* Téléphone et écrans moyens : rubriques + documents + fiche
            dans une feuille, comme les infos de groupe WhatsApp */}
        <ChantierInfoSheet
          chantierId={chantierId}
          chantierNom={chantier.nom}
          rubriques={rubriques}
          className="xl:hidden"
        />
      </div>

      {/* Corps : rail gauche (lg+) / colonne du fil / rubriques (xl+) */}
      <div className="flex min-h-0 flex-1 gap-4">
        {/* Rail gauche : canaux + documents, comme la maquette v4 */}
        <aside className="hidden w-56 shrink-0 flex-col gap-5 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 lg:flex">
          <ChannelBar variant="list" {...channelBarProps} />
          <nav aria-label="Documents" className="flex flex-col gap-1">
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Documents
            </div>
            {documents.map((d) => (
              <Link
                key={d.href}
                href={d.href}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              >
                <d.Icon size={14} className="shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate">{d.label}</span>
              </Link>
            ))}
          </nav>
        </aside>

        {/* Colonne centrale : canaux (mobile), fil, composer */}
        <section className="flex min-w-0 flex-1 flex-col">
          {/* Mobile : onglets de canaux (les rubriques sont dans la
              feuille d'infos, bouton en en-tête) */}
          <div className="mb-1.5 shrink-0 lg:hidden">
            <ChannelBar variant="tabs" {...channelBarProps} />
          </div>

          {/* Écran large : rappel du canal actif au-dessus du fil */}
          <div className="mb-2 hidden shrink-0 items-center gap-1.5 px-1 lg:flex">
            <Hash size={15} className="text-brand-600" />
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {activeChannel.nom}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              · {visibilityLabel}
            </span>
          </div>

          {/* Feed scrollable */}
          <div className="mb-2 min-h-0 flex-1 overflow-hidden md:mb-3">
            <Card className="h-full">
              <CardBody className="!p-0 h-full overflow-y-auto">
                <ChantierFeed
                  chantierId={chantierId}
                  messages={messages.map((m) => ({
                    id: m.id,
                    authorId: m.authorId,
                    authorName: m.author?.name ?? null,
                    authorRole: m.author?.role ?? null,
                    type: m.type,
                    texte: m.texte,
                    photos: m.photos,
                    videos: m.videos,
                    hiddenFromClient: m.hiddenFromClient,
                    incidentId: m.incidentId,
                    demandeId: m.demandeId,
                    commandeId: m.commandeId,
                    sortieId: m.sortieId,
                    rapportId: m.rapportId,
                    tacheId: m.tacheId,
                    reserveId: m.reserveId,
                    createdAt: m.createdAt,
                    reactions: m.reactions.map((r) => ({
                      emoji: r.emoji,
                      userId: r.userId,
                    })),
                    tags: m.tags.map((t) => t.tagCode),
                  }))}
                  currentUserId={me.id}
                  viewerRole={me.role}
                  canEdit={me.isAdmin || me.isConducteur}
                  canPilotDemandes={me.isAdmin || me.isConducteur}
                  demandeInfo={demandeInfo}
                  photoMeta={photoMeta}
                />
              </CardBody>
            </Card>
          </div>

          {/* Composer fixé en bas */}
          <div className="shrink-0">
            <ChantierComposer
              chantierId={chantierId}
              canalId={activeCanalId}
              materiels={materiels}
              equipes={equipes}
              sortiesOuvertes={sortiesForComposer}
              canHideFromClient={me.isAdmin || me.isConducteur}
            />
          </div>
        </section>

        {/* Rubriques du chantier : panneau droit (très grands écrans) */}
        <aside className="hidden w-60 shrink-0 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 xl:block">
          <RubriquesPanel rubriques={rubriques} />
        </aside>
      </div>
    </div>
  );
}
