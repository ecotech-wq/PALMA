import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, requireAffaireAccess } from "@/lib/auth-helpers";
import { parseDocumentsMessage } from "@/lib/pieces-jointes";

/**
 * Recherche dans tout l'historique du fil d'une AFFAIRE (au-delà des
 * pages chargées). Décalque de /api/messagerie/[chantierId]/search borné
 * aux canaux de l'affaire ; garde affaire (pilotes + frontière espace).
 *
 *   GET /api/messagerie/affaire/[affaireId]/search?q=devis&before=ISO
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
    const q = (url.searchParams.get("q") ?? "").trim();
    if (q.length < 2) {
      return NextResponse.json({ messages: [] });
    }
    const beforeRaw = url.searchParams.get("before");
    const before = beforeRaw ? new Date(beforeRaw) : null;

    const messages = await db.journalMessage.findMany({
      where: {
        canal: { affaireId },
        ...(before && !isNaN(before.getTime())
          ? { createdAt: { lt: before } }
          : {}),
        OR: [
          { texte: { contains: q, mode: "insensitive" } },
          { author: { name: { contains: q, mode: "insensitive" } } },
        ],
      },
      include: {
        author: { select: { id: true, name: true, role: true } },
        reactions: { select: { emoji: true, userId: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
    });

    return NextResponse.json({
      messages: messages.map((m) => ({
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
        createdAt: m.createdAt.toISOString(),
        reactions: m.reactions.map((r) => ({
          emoji: r.emoji,
          userId: r.userId,
        })),
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur" },
      { status: 400 }
    );
  }
}
