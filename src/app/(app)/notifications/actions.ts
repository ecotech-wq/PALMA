"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-helpers";

/** Marque une notification comme lue. */
export async function markNotificationRead(id: string) {
  const me = await requireAuth();
  await db.notification.updateMany({
    where: { id, userId: me.id },
    data: { read: true },
  });
  revalidatePath("/");
}

/** Marque toutes les notifications de l'utilisateur comme lues. */
export async function markAllNotificationsRead() {
  const me = await requireAuth();
  await db.notification.updateMany({
    where: { userId: me.id, read: false },
    data: { read: true },
  });
  revalidatePath("/");
}

/** Supprime une notification. */
export async function deleteNotification(id: string) {
  const me = await requireAuth();
  await db.notification.deleteMany({
    where: { id, userId: me.id },
  });
  revalidatePath("/");
}

/** Supprime toutes les notifications lues. */
export async function clearReadNotifications() {
  const me = await requireAuth();
  await db.notification.deleteMany({
    where: { userId: me.id, read: true },
  });
  revalidatePath("/");
}
