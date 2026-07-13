import "server-only";
import { db } from "@/lib/db";
import { sendPushTo, sendPushToMany } from "@/lib/push";

type NotifType =
  | "RAPPORT_CREE"
  | "INCIDENT_OUVERT"
  | "INCIDENT_RESOLU"
  | "DEMANDE_CREEE"
  | "DEMANDE_APPROUVEE"
  | "DEMANDE_REFUSEE"
  | "DEMANDE_COMMANDEE"
  | "PAIEMENT_GENERE"
  | "USER_PENDING"
  | "RELANCE"
  | "AUTRE";

/**
 * Crée une notification pour un utilisateur précis.
 * Silencieux en cas d'erreur (on ne bloque jamais l'action métier
 * pour un souci de notification).
 */
export async function notify(
  userId: string,
  type: NotifType,
  title: string,
  message?: string | null,
  link?: string | null
): Promise<void> {
  try {
    await db.notification.create({
      data: {
        userId,
        type,
        title,
        message: message ?? null,
        link: link ?? null,
      },
    });
    // Fire-and-forget : Web Push (silencieux si VAPID non configuré)
    sendPushTo(userId, {
      title,
      body: message,
      url: link,
      tag: type,
    }).catch(() => {});
  } catch (e) {
    console.error("notify failed:", e);
  }
}

/**
 * Notifie tous les admins actifs (utile pour les events qui doivent
 * remonter au CEO : nouvelle demande matériel, incident urgent, etc.).
 */
export async function notifyAdmins(
  type: NotifType,
  title: string,
  message?: string | null,
  link?: string | null
): Promise<void> {
  try {
    const admins = await db.user.findMany({
      where: { role: "ADMIN", status: "ACTIVE" },
      select: { id: true },
    });
    await db.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        type,
        title,
        message: message ?? null,
        link: link ?? null,
      })),
    });
    // Fire-and-forget : Web Push pour chaque admin
    sendPushToMany(
      admins.map((a) => a.id),
      { title, body: message, url: link, tag: type }
    ).catch(() => {});
  } catch (e) {
    console.error("notifyAdmins failed:", e);
  }
}
