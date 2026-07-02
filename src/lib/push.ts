import "server-only";
import webpush from "web-push";
import { db } from "@/lib/db";
import { BRAND } from "@/lib/theme";

/* -------------------------------------------------------------------------
 *  Web Push — envoi de notifications navigateur.
 *
 *  Configuration (env vars, à définir dans .env / .env.production) :
 *    VAPID_PUBLIC_KEY   clé publique (aussi exposée côté client via NEXT_PUBLIC_VAPID_PUBLIC_KEY)
 *    VAPID_PRIVATE_KEY  clé privée
 *    VAPID_SUBJECT      mailto:... ou URL du site (ex: mailto:admin@autonhome.alphatek.fr)
 *
 *  Pour générer une paire de clés :
 *      npx web-push generate-vapid-keys
 *
 *  Si les variables ne sont pas définies, sendPushTo est un no-op silencieux
 *  (l'app continue de fonctionner avec les notifications in-app uniquement).
 * ----------------------------------------------------------------------- */

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subj = process.env.VAPID_SUBJECT || BRAND.pushSubjectFallback;
  if (!pub || !priv) {
    return false;
  }
  try {
    webpush.setVapidDetails(subj, pub, priv);
    configured = true;
    return true;
  } catch (e) {
    console.error("VAPID setup failed:", e);
    return false;
  }
}

export type PushPayload = {
  title: string;
  body?: string | null;
  url?: string | null;
  tag?: string;
};

/**
 * Envoie une notification push à toutes les subscriptions d'un user.
 * Silencieux en cas d'erreur, supprime les subscriptions expirées (410).
 */
export async function sendPushTo(
  userId: string,
  payload: PushPayload
): Promise<void> {
  if (!ensureConfigured()) return;

  const subs = await db.pushSubscription.findMany({
    where: { userId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  if (subs.length === 0) return;

  const json = JSON.stringify({
    title: payload.title,
    body: payload.body ?? "",
    url: payload.url ?? "/",
    tag: payload.tag,
  });

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          json
        );
        // Met à jour lastUsed sans bloquer
        db.pushSubscription
          .update({ where: { id: s.id }, data: { lastUsed: new Date() } })
          .catch(() => {});
      } catch (e: unknown) {
        const status =
          typeof e === "object" && e !== null && "statusCode" in e
            ? (e as { statusCode?: number }).statusCode
            : undefined;
        // 404/410 : subscription révoquée par le navigateur, on nettoie
        if (status === 404 || status === 410) {
          db.pushSubscription
            .delete({ where: { id: s.id } })
            .catch(() => {});
        } else {
          console.error("Push send failed:", status, e);
        }
      }
    })
  );
}

/** Pousse à plusieurs users en parallèle. */
export async function sendPushToMany(
  userIds: string[],
  payload: PushPayload
): Promise<void> {
  await Promise.all(userIds.map((id) => sendPushTo(id, payload)));
}
