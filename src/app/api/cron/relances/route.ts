import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { executerRelances } from "@/lib/relances";

// Déclencheur HTTP du balayage des relances, pour un cron SYSTÈME externe
// (crontab, systemd timer, moniteur d'uptime) : POST avec l'en-tête
// « Authorization: Bearer CRON_SECRET ». Complète le cron interne
// (src/instrumentation.ts) quand le processus Node redémarre souvent.
// Le moteur est idempotent (RelanceLog) : un double déclenchement le même
// jour ne renvoie aucune notification en double.

/**
 * Égalité en temps constant : on compare les empreintes SHA-256 des deux
 * chaînes (le hachage égalise les longueurs, condition de timingSafeEqual),
 * ce qui ne laisse fuiter ni la longueur ni un préfixe du secret.
 */
function memeValeur(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET non configuré côté serveur" },
      { status: 503 }
    );
  }
  const autorisation = req.headers.get("authorization");
  if (!autorisation || !memeValeur(autorisation, `Bearer ${secret}`)) {
    return NextResponse.json(
      { ok: false, error: "Non autorisé" },
      { status: 401 }
    );
  }
  try {
    const bilan = await executerRelances();
    return NextResponse.json({ ok: true, ...bilan });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
