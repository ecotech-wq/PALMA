import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, requireAffaireAccess } from "@/lib/auth-helpers";

/**
 * Polling léger du fil d'une AFFAIRE : combien de nouveaux messages
 * depuis `since` (ISO 8601). Décalque de /api/messagerie/[chantierId]/poll
 * pour les canaux d'affaire : les messages y sont ancrés par leur canal
 * (chantierId null), on compte donc via la relation canal -> affaire.
 *
 *   GET /api/messagerie/affaire/[affaireId]/poll?since=ISO
 *   → { count: 3, latest: "..." }
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
    const sinceRaw = url.searchParams.get("since");
    const since = sinceRaw ? new Date(sinceRaw) : new Date(Date.now() - 60_000);
    if (isNaN(since.getTime())) {
      return NextResponse.json(
        { count: 0, latest: new Date().toISOString() },
        { status: 200 }
      );
    }

    const [count, latest] = await Promise.all([
      db.journalMessage.count({
        where: { canal: { affaireId }, createdAt: { gt: since } },
      }),
      db.journalMessage.findFirst({
        where: { canal: { affaireId } },
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
