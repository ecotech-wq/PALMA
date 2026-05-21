import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-helpers";

const schema = z.object({
  endpoint: z.string().url(),
});

/**
 * Supprime un abonnement Push (déclenché quand l'utilisateur désactive
 * les notifications navigateur depuis l'app).
 */
export async function POST(req: Request) {
  try {
    const me = await requireAuth();
    const body = schema.parse(await req.json());
    await db.pushSubscription.deleteMany({
      where: { endpoint: body.endpoint, userId: me.id },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
