import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, requireChantierAccess } from "@/lib/auth-helpers";
import { parseDocumentsMessage } from "@/lib/pieces-jointes";
import { GENERAL_CHANNEL_NAME, listChannelsFor } from "@/features/messaging";

/**
 * Recherche dans tout l'historique du fil d'un chantier (au-delà de la
 * fenêtre 14j du feed). Renvoie max 50 messages les plus récents matching.
 *
 *   GET /api/messagerie/[chantierId]/search?q=carrelage&before=ISO
 *
 * Sécurité (mêmes règles que la page serveur du fil) : les comptes
 * CLIENT sont refusés (403), et la recherche est bornée aux canaux que
 * l'appelant a le droit de voir (politique de visibilité + adhésion
 * CanalMembre, via listChannelsFor). Les messages historiques sans canal
 * ne sont inclus que si le Général est visible (ils y sont rattachés).
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
    const q = (url.searchParams.get("q") ?? "").trim();
    if (q.length < 2) {
      return NextResponse.json({ messages: [] });
    }
    const beforeRaw = url.searchParams.get("before");
    const before = beforeRaw ? new Date(beforeRaw) : null;

    // Canaux visibles par l'appelant sur CE chantier : la recherche ne
    // sort jamais de ce périmètre.
    const channels = await listChannelsFor(me, chantierId);
    const canalIds = channels.map((c) => c.id);
    const generalVisible = channels.some(
      (c) => c.nom === GENERAL_CHANNEL_NAME
    );
    const filtreCanaux = generalVisible
      ? { OR: [{ canalId: { in: canalIds } }, { canalId: null }] }
      : { canalId: { in: canalIds } };

    // Limite : on cherche dans tout l'historique mais on ne renvoie que
    // 50 messages pour ne pas crouler l'UI
    const messages = await db.journalMessage.findMany({
      where: {
        chantierId,
        ...(before && !isNaN(before.getTime())
          ? { createdAt: { lt: before } }
          : {}),
        AND: [
          filtreCanaux,
          {
            OR: [
              { texte: { contains: q, mode: "insensitive" } },
              { author: { name: { contains: q, mode: "insensitive" } } },
            ],
          },
        ],
        // Défense en profondeur : un client (déjà refusé en 403 ci-dessus)
        // ne recevrait de toute façon jamais les messages qui lui sont cachés.
        ...(me.isClient ? { hiddenFromClient: false } : {}),
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
