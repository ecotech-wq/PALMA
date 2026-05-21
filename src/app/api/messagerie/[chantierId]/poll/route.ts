import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, requireChantierAccess } from "@/lib/auth-helpers";

/**
 * Endpoint de polling léger : combien de nouveaux messages depuis `since`
 * (ISO 8601). Renvoie un latest cursor pour le prochain appel.
 *
 *   GET /api/messagerie/[chantierId]/poll?since=2026-05-20T12:34:56.000Z
 *   → { count: 3, latest: "2026-05-20T12:35:42.123Z" }
 *
 * Si `since` est absent ou invalide, fenêtre par défaut = 60 dernières secondes.
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
    const sinceRaw = url.searchParams.get("since");
    const since = sinceRaw ? new Date(sinceRaw) : new Date(Date.now() - 60_000);
    if (isNaN(since.getTime())) {
      return NextResponse.json(
        { count: 0, latest: new Date().toISOString() },
        { status: 200 }
      );
    }

    // On compte STRICTEMENT après `since` pour éviter d'inclure le dernier
    // message déjà vu côté client.
    const [count, latest] = await Promise.all([
      db.journalMessage.count({
        where: { chantierId, createdAt: { gt: since } },
      }),
      db.journalMessage.findFirst({
        where: { chantierId },
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json({
      count,
      latest: (latest?.createdAt ?? since).toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { count: 0, error: e instanceof Error ? e.message : "Erreur" },
      { status: 400 }
    );
  }
}
