import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, requireChantierAccess } from "@/lib/auth-helpers";

/**
 * Recherche dans tout l'historique du fil d'un chantier (au-delà de la
 * fenêtre 14j du feed). Renvoie max 50 messages les plus récents matching.
 *
 *   GET /api/messagerie/[chantierId]/search?q=carrelage&before=ISO
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ chantierId: string }> }
) {
  try {
    const me = await requireAuth();
    const { chantierId } = await ctx.params;
    await requireChantierAccess(me, chantierId);

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    if (q.length < 2) {
      return NextResponse.json({ messages: [] });
    }
    const beforeRaw = url.searchParams.get("before");
    const before = beforeRaw ? new Date(beforeRaw) : null;

    // Limite : on cherche dans tout l'historique mais on ne renvoie que
    // 50 messages pour ne pas crouler l'UI
    const messages = await db.journalMessage.findMany({
      where: {
        chantierId,
        ...(before ? { createdAt: { lt: before } } : {}),
        OR: [
          { texte: { contains: q, mode: "insensitive" } },
          { author: { name: { contains: q, mode: "insensitive" } } },
        ],
      },
      include: {
        author: { select: { id: true, name: true, role: true } },
        reactions: { select: { emoji: true, userId: true } },
      },
      orderBy: { createdAt: "desc" },
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
