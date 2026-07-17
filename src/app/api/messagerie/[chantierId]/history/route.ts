import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, requireChantierAccess } from "@/lib/auth-helpers";
import { getPhotoMetadata } from "@/lib/upload";
import { parseDocumentsMessage } from "@/lib/pieces-jointes";
import { TAILLE_PAGE_MESSAGES } from "@/features/messaging/core/pagination";
import { GENERAL_CHANNEL_NAME, listChannelsFor } from "@/features/messaging";

/**
 * Page suivante du fil vers le passé (bouton « Messages précédents »).
 * Renvoie les TAILLE_PAGE_MESSAGES messages strictement antérieurs au
 * curseur `(before, beforeId)`, dans l'ordre d'affichage (ascendant),
 * plus un drapeau `hasMore` et les métadonnées EXIF des photos de la page.
 *
 *   GET /api/messagerie/[chantierId]/history?before=ISO&beforeId=<id>&canal=<id>
 *
 * Sécurité (mêmes règles que la page serveur du fil) :
 *   - les comptes CLIENT sont refusés (la page les redirige, l'API rend 403) ;
 *   - `canal` est obligatoire et doit être un canal du chantier VISIBLE par
 *     l'appelant (politique de visibilité + adhésion CanalMembre, via
 *     listChannelsFor) ; l'inclusion des messages historiques sans canal
 *     (rattachés au Général) est dérivée côté serveur, jamais du client.
 *
 * Curseur composite (createdAt, id) : `beforeId` départage les messages
 * créés dans la même milliseconde (rafale de messages système, import),
 * sinon le `lt` strict sur createdAt sauterait le jumeau du curseur.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ chantierId: string }> }
) {
  try {
    const me = await requireAuth();
    const { chantierId } = await ctx.params;
    await requireChantierAccess(me, chantierId);
    if (me.isClient) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const url = new URL(req.url);
    const beforeRaw = url.searchParams.get("before");
    const before = beforeRaw ? new Date(beforeRaw) : null;
    if (!before || isNaN(before.getTime())) {
      return NextResponse.json({ messages: [], hasMore: false, photoMeta: {} });
    }
    const beforeId = url.searchParams.get("beforeId");

    // Canal obligatoire, et vérifié contre la liste des canaux que
    // l'appelant a le droit de voir sur CE chantier.
    const canalId = url.searchParams.get("canal");
    if (!canalId) {
      return NextResponse.json({ error: "Canal requis" }, { status: 400 });
    }
    const channels = await listChannelsFor(me, chantierId);
    const canal = channels.find((c) => c.id === canalId);
    if (!canal) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    // Les messages historiques sans canal restent rattachés au Général :
    // dérivé du canal lui-même (le paramètre `general` du client est ignoré).
    const inclureSansCanal = canal.nom === GENERAL_CHANNEL_NAME;

    // On lit une page + 1 pour savoir s'il reste encore des messages
    // plus anciens, puis on renvoie la page dans l'ordre d'affichage.
    const rows = await db.journalMessage.findMany({
      where: {
        chantierId,
        AND: [
          inclureSansCanal
            ? { OR: [{ canalId }, { canalId: null }] }
            : { canalId },
          // Curseur composite : strictement avant (before, beforeId).
          beforeId
            ? {
                OR: [
                  { createdAt: { lt: before } },
                  { createdAt: before, id: { lt: beforeId } },
                ],
              }
            : { createdAt: { lt: before } },
        ],
        // Défense en profondeur : un client (déjà refusé en 403 ci-dessus)
        // ne recevrait de toute façon jamais les messages qui lui sont cachés.
        ...(me.isClient ? { hiddenFromClient: false } : {}),
      },
      include: {
        author: { select: { id: true, name: true, role: true } },
        reactions: { select: { emoji: true, userId: true } },
        tags: { select: { tagCode: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: TAILLE_PAGE_MESSAGES + 1,
    });

    const hasMore = rows.length > TAILLE_PAGE_MESSAGES;
    const fenetre = rows.slice(0, TAILLE_PAGE_MESSAGES).reverse();

    const photoUrls = fenetre.flatMap((m) => m.photos);
    const photoMeta =
      photoUrls.length > 0 ? await getPhotoMetadata(photoUrls) : {};

    return NextResponse.json({
      hasMore,
      photoMeta,
      messages: fenetre.map((m) => ({
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
        createdAt: m.createdAt.toISOString(),
        reactions: m.reactions.map((r) => ({
          emoji: r.emoji,
          userId: r.userId,
        })),
        tags: m.tags.map((t) => t.tagCode),
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur" },
      { status: 400 }
    );
  }
}
