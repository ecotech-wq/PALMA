import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-helpers";

const schema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

/**
 * Enregistre (ou met à jour) un abonnement Web Push pour l'utilisateur
 * connecté. L'endpoint est unique côté DB : si l'utilisateur se
 * réabonne sur le même device, on met juste à jour les clés.
 */
export async function POST(req: Request) {
  try {
    const me = await requireAuth();
    const body = schema.parse(await req.json());
    const ua = req.headers.get("user-agent") || null;

    await db.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      create: {
        userId: me.id,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: ua,
      },
      update: {
        userId: me.id,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: ua,
        lastUsed: new Date(),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
