import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, requireAffaireAccess } from "@/lib/auth-helpers";
import { getPhotoMetadata } from "@/lib/upload";
import { parseDocumentsMessage } from "@/lib/pieces-jointes";
import { TAILLE_PAGE_MESSAGES } from "@/features/messaging/core/pagination";

/**
 * Page suivante du fil d'une AFFAIRE vers le passé (« Messages
 * précédents »). Décalque de /api/messagerie/[chantierId]/history pour les
 * canaux d'affaire (chantierId null, ancrage canalId) : mêmes curseurs
 * composites (createdAt, id), même forme de réponse, garde affaire
 * (pilotes + frontière espace) à la place de requireChantierAccess.
 *
 *   GET /api/messagerie/affaire/[affaireId]/history?before=ISO&beforeId=<id>&canal=<id>
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ affaireId: string }> }
) {
  try {
    const me = await requireAuth();
    const { affaireId } = await ctx.params;
    await requireAffaireAccess(me, affaireId);

    const url = new URL(req.url);
    const beforeRaw = url.searchParams.get("before");
    const before = beforeRaw ? new Date(beforeRaw) : null;
    if (!before || isNaN(before.getTime())) {
      return NextResponse.json({ messages: [], hasMore: false, photoMeta: {} });
    }
    const beforeId = url.searchParams.get("beforeId");

    // Canal obligatoire et appartenant à CETTE affaire (un id forgé vers
    // le canal d'un autre fil est refusé).
    const canalId = url.searchParams.get("canal");
    if (!canalId) {
      return NextResponse.json({ error: "Canal requis" }, { status: 400 });
    }
    const canal = await db.canal.findFirst({
      where: { id: canalId, affaireId },
      select: { id: true },
    });
    if (!canal) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const rows = await db.journalMessage.findMany({
      where: {
        canalId,
        // Curseur composite : strictement avant (before, beforeId).
        ...(beforeId
          ? {
              OR: [
                { createdAt: { lt: before } },
                { createdAt: before, id: { lt: beforeId } },
              ],
            }
          : { createdAt: { lt: before } }),
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
