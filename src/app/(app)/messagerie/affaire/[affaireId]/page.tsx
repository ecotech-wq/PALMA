import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarClock, ChevronLeft, Handshake } from "lucide-react";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-helpers";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { markResourceRead } from "@/lib/read-state";
import { getPhotoMetadata } from "@/lib/upload";
import { parseDocumentsMessage } from "@/lib/pieces-jointes";
import { getOrCreateCanalAffaire } from "@/features/messaging";
import { TAILLE_PAGE_MESSAGES } from "@/features/messaging/core/pagination";
import {
  LIBELLES_TYPOLOGIE,
  estDormante,
  etapesDe,
  joursDansEtape,
  libelleEtape,
  type TypologieAffaire,
} from "@/lib/affaires";
import { ChantierFeed } from "../../ChantierFeed";
import { ChantierComposer } from "../../ChantierComposer";
import { ActionsRapidesAffaire } from "./ActionsRapidesAffaire";

// ─── Fil d'une AFFAIRE (CRM) dans la messagerie ──────────────────────────────
// Choix d'architecture (le plus économe) : plutôt que de généraliser la page
// /messagerie/[chantierId], gavée de données propres aux chantiers (canaux
// multiples, rubriques, documents, matériel, demandes...), cette route dédiée
// REUTILISE les deux briques client du fil (ChantierFeed + ChantierComposer)
// avec un simple contexte d'affaire (prop affaireId) : mêmes bulles, mêmes
// médias (photos, vidéos, mémos vocaux, documents), même pagination et même
// polling, via les routes /api/messagerie/affaire/[affaireId]/*.
// Gardes : INTERNE uniquement (jamais de client) et frontière d'espace,
// comme tout le module affaires (pilotes : ADMIN + CONDUCTEUR).

const dateCourteFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
});

export default async function MessagerieAffairePage({
  params,
}: {
  params: Promise<{ affaireId: string }>;
}) {
  const { affaireId } = await params;
  const me = await requireAuth();
  if (me.isClient) redirect("/dashboard");
  if (!me.canPilot) redirect("/accueil");

  const affaire = await db.affaire.findUnique({
    where: { id: affaireId },
    select: {
      id: true,
      espaceId: true,
      titre: true,
      typologie: true,
      etapeCle: true,
      etapeDepuis: true,
      statut: true,
      prochaineAction: true,
      prochaineActionLe: true,
      contactNom: true,
    },
  });
  if (!affaire) notFound();
  // Frontière d'espace : un id forgé d'un autre espace tombe sur un 404.
  if (me.espaceIds && !me.espaceIds.includes(affaire.espaceId)) notFound();

  const typologie = affaire.typologie as TypologieAffaire;
  const canal = await getOrCreateCanalAffaire(affaire.id);

  // Marque le fil comme lu (badge non-lus du hub et de l'accueil).
  await markResourceRead(me.id, `affaire:${affaire.id}`);

  // Première page du fil : mêmes curseurs que le fil de chantier.
  const rows = await db.journalMessage.findMany({
    where: { canalId: canal.id },
    include: {
      author: { select: { id: true, name: true, role: true } },
      reactions: { select: { emoji: true, userId: true } },
      tags: { select: { tagCode: true } },
    },
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
    take: TAILLE_PAGE_MESSAGES + 1,
  });
  const hasOlder = rows.length > TAILLE_PAGE_MESSAGES;
  const messages = rows.slice(0, TAILLE_PAGE_MESSAGES).reverse();

  const allPhotoUrls = messages.flatMap((m) => m.photos);
  const photoMeta =
    allPhotoUrls.length > 0 ? await getPhotoMetadata(allPhotoUrls) : {};

  const maintenant = new Date();
  const dormance = estDormante(affaire, maintenant);
  const enRetard = dormance?.motif === "ACTION_EN_RETARD";

  // Destinataires possibles d'une action confiée : pilotes de l'espace,
  // même liste que la fiche affaire (le module Affaires est canPilot-only,
  // un CHEF recevrait des liens /affaires/... qui le redirigent).
  const cibles = await db.user.findMany({
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

  return (
    // Même coquille plein écran que le fil de chantier (voir le commentaire
    // détaillé dans /messagerie/[chantierId]/page.tsx).
    <div className="flex h-[calc(100dvh-131px)] md:h-[calc(100vh-64px)] min-h-[280px] flex-col -mb-28 md:mb-0">
      {/* En-tête compact : retour, titre, typologie. */}
      <div className="mb-2 flex shrink-0 items-center gap-2">
        <Link
          href="/messagerie"
          aria-label="Retour à la messagerie"
          className="shrink-0 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <ChevronLeft size={18} />
        </Link>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-950 text-slate-50 dark:bg-slate-100 dark:text-slate-950">
          <Handshake size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold text-slate-900 dark:text-slate-100 md:text-xl">
            {affaire.titre}
          </h1>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {LIBELLES_TYPOLOGIE[typologie]} · {affaire.contactNom} · fil
            interne aux pilotes
          </p>
        </div>
      </div>

      {/* Bandeau de pilotage : étape courante, prochaine action, gestes
          rapides. C'est ce qui fait du fil un poste de travail. */}
      <div className="mb-2 shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900 md:mb-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {libelleEtape(typologie, affaire.etapeCle)}
            </span>
            <span className="text-slate-500">
              depuis {joursDansEtape(affaire.etapeDepuis, maintenant)} j
            </span>
            {affaire.statut === "GAGNEE" && <Badge color="green">Gagnée</Badge>}
            {affaire.statut === "PERDUE" && <Badge color="red">Perdue</Badge>}
            {affaire.statut === "EN_COURS" && dormance && (
              <Badge color="yellow">
                {dormance.motif === "ACTION_EN_RETARD"
                  ? `Action en retard de ${dormance.jours} j`
                  : `Sans action depuis ${dormance.jours} j`}
              </Badge>
            )}
            <span className="flex w-full items-center gap-1.5 text-slate-600 dark:text-slate-400 sm:w-auto">
              <CalendarClock
                size={13}
                className={
                  enRetard ? "shrink-0 text-brand-600" : "shrink-0 text-slate-400"
                }
              />
              {affaire.prochaineAction ? (
                <span className="min-w-0 truncate">
                  {affaire.prochaineAction}
                  {affaire.prochaineActionLe && (
                    <span
                      className={
                        enRetard
                          ? "ml-1 font-medium text-brand-700 dark:text-brand-400"
                          : "ml-1 text-slate-500"
                      }
                    >
                      ({dateCourteFmt.format(affaire.prochaineActionLe)})
                    </span>
                  )}
                </span>
              ) : (
                <span className="italic text-slate-400">
                  Aucune prochaine action planifiée
                </span>
              )}
            </span>
          </div>
          <ActionsRapidesAffaire
            affaireId={affaire.id}
            etapeCle={affaire.etapeCle}
            etapes={etapesDe(typologie)}
            cibles={cibles}
            statut={affaire.statut}
          />
        </div>
      </div>

      {/* Fil : la brique du chantier, en contexte affaire. Les messages
          système du pipeline (création, étapes, issues) y apparaissent. */}
      <div className="mb-2 min-h-0 flex-1 overflow-hidden md:mb-3">
        <Card className="h-full">
          <CardBody className="!p-0 h-full overflow-y-auto">
            <ChantierFeed
              key={canal.id}
              chantierId=""
              affaireId={affaire.id}
              canalId={canal.id}
              canalGeneral={false}
              hasOlder={hasOlder}
              messages={messages.map((m) => ({
                id: m.id,
                authorId: m.authorId,
                authorName: m.author?.name ?? null,
                authorRole: m.author?.role ?? null,
                type: m.type,
                texte: m.texte,
                photos: m.photos,
                videos: m.videos,
                audios: m.audios,
                documents: parseDocumentsMessage(m.documents),
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
              canPilotDemandes={false}
              photoMeta={photoMeta}
            />
          </CardBody>
        </Card>
      </div>

      {/* Composer : mêmes médias que les chantiers, cible = l'affaire. */}
      <div className="shrink-0">
        <ChantierComposer
          affaireId={affaire.id}
          canalId={canal.id}
          canHideFromClient={false}
        />
      </div>
    </div>
  );
}
