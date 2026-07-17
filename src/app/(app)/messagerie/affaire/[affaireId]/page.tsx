import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, Handshake } from "lucide-react";
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
  parseChecklist,
  type TypologieAffaire,
} from "@/lib/affaires";
import { parseDossiersPerso } from "@/lib/ged-affaire";
import { ChantierFeed } from "../../ChantierFeed";
import { ChantierComposer } from "../../ChantierComposer";
import { ActionsRapidesAffaire } from "./ActionsRapidesAffaire";
import type { DocPiece } from "./ChecklistFil";
import { ProchaineActionFil } from "./ProchaineActionFil";

// ─── Fil d'une AFFAIRE (CRM) dans la messagerie ──────────────────────────────
// Choix d'architecture (le plus économe) : plutôt que de généraliser la page
// /messagerie/[chantierId], gavée de données propres aux chantiers (canaux
// multiples, rubriques, documents, matériel, demandes...), cette route dédiée
// REUTILISE les deux briques client du fil (ChantierFeed + ChantierComposer)
// avec un simple contexte d'affaire (prop affaireId) : mêmes bulles, mêmes
// médias (photos, vidéos, mémos vocaux, documents), même pagination et même
// polling, via les routes /api/messagerie/affaire/[affaireId]/*.
// Le bandeau tient sur UNE ligne (étape + prochaine action + menu « ... ») :
// le fil de messages garde le maximum de hauteur ; la checklist et les
// gestes de pilotage vivent dans la feuille « + » du composer.
// Gardes : INTERNE uniquement (jamais de client) et frontière d'espace,
// comme tout le module affaires (pilotes : ADMIN + CONDUCTEUR).

export default async function MessagerieAffairePage({
  params,
}: {
  params: Promise<{ affaireId: string }>;
}) {
  const { affaireId } = await params;
  const me = await requireAuth();
  if (me.isClient) redirect("/aujourdhui");
  if (!me.canPilot) redirect("/aujourdhui");

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
      checklist: true,
      dossiersPerso: true,
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

  // Dossier client (GED d'affaire) : le compteur du menu « ... » dit d'un
  // coup d'œil combien de pièces sont déjà rangées.
  const nbDocsDossier = await db.affaireDocument.count({
    where: { affaireId: affaire.id },
  });

  // Checklist du dossier + documents de la GED d'affaire qui valident une
  // pièce (AffaireDocument.checklistCle) : le plus récent par clé gagne
  // (tri croissant, la dernière écriture écrase les précédentes).
  const checklist = parseChecklist(affaire.checklist);
  const dossiersPerso = parseDossiersPerso(affaire.dossiersPerso);
  const docParPiece: Record<string, DocPiece> = {};
  if (checklist.length > 0) {
    const docsChecklist = await db.affaireDocument.findMany({
      where: { affaireId: affaire.id, checklistCle: { not: null } },
      orderBy: { createdAt: "asc" },
      select: { checklistCle: true, fichier: true, nom: true },
    });
    for (const d of docsChecklist) {
      if (d.checklistCle) {
        docParPiece[d.checklistCle] = { url: d.fichier, nom: d.nom };
      }
    }
  }

  // Pièces du fil déjà rangées dans le dossier client : messageId ->
  // fichiers. Les pièces encore libres portent un bouton dossier dans le
  // fil (rangement après coup, idempotent).
  const rangees: Record<string, string[]> = {};
  const docsRanges = await db.affaireDocument.findMany({
    where: { affaireId: affaire.id, messageId: { not: null } },
    select: { messageId: true, fichier: true },
  });
  for (const d of docsRanges) {
    if (!d.messageId) continue;
    (rangees[d.messageId] ??= []).push(d.fichier);
  }

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
        {affaire.statut === "GAGNEE" && <Badge color="green">Gagnée</Badge>}
        {affaire.statut === "PERDUE" && <Badge color="red">Perdue</Badge>}
      </div>

      {/* Bandeau de pilotage sur UNE ligne : étape, prochaine action
          tappable, menu « ... » (Fiche, Dossier client, Confier). */}
      <div className="mb-2 shrink-0 rounded-xl border border-slate-200 bg-white px-2 py-1 dark:border-slate-800 dark:bg-slate-900 md:mb-3">
        <ActionsRapidesAffaire
          affaireId={affaire.id}
          etapeCle={affaire.etapeCle}
          etapes={etapesDe(typologie)}
          cibles={cibles}
          statut={affaire.statut}
          nbDocsDossier={nbDocsDossier}
        >
          <ProchaineActionFil
            affaireId={affaire.id}
            prochaineAction={affaire.prochaineAction}
            prochaineActionLe={
              affaire.prochaineActionLe
                ? affaire.prochaineActionLe.toISOString().slice(0, 10)
                : null
            }
            enRetard={enRetard}
            canEdit={affaire.statut === "EN_COURS"}
          />
        </ActionsRapidesAffaire>
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
              affaireGed={{
                checklist,
                dossiersPerso,
                rangees,
              }}
            />
          </CardBody>
        </Card>
      </div>

      {/* Composer : mêmes médias que les chantiers, cible = l'affaire,
          classement des pièces AVANT envoi et pilotage dans la feuille +. */}
      <div className="shrink-0">
        <ChantierComposer
          affaireId={affaire.id}
          canalId={canal.id}
          canHideFromClient={false}
          checklistDossier={checklist}
          docsChecklist={docParPiece}
          dossiersPerso={dossiersPerso}
          pilotage={{
            cibles,
            prochaineAction: affaire.prochaineAction,
            prochaineActionLe: affaire.prochaineActionLe
              ? affaire.prochaineActionLe.toISOString().slice(0, 10)
              : null,
            active: affaire.statut === "EN_COURS",
          }}
        />
      </div>
    </div>
  );
}
