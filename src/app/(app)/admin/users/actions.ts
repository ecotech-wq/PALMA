"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { createResetTokenForUser } from "@/lib/password-reset";
import { sendEmail, isEmailConfigured } from "@/lib/email";

async function ensureAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    throw new Error("Accès refusé : réservé aux administrateurs");
  }
  return session.user;
}

export async function approveUser(userId: string) {
  await ensureAdmin();
  await db.user.update({
    where: { id: userId },
    data: { status: "ACTIVE" },
  });
  revalidatePath("/admin/users");
}

export async function revokeUser(userId: string) {
  const me = await ensureAdmin();
  if (userId === me.id) {
    throw new Error("Tu ne peux pas révoquer ton propre compte");
  }
  await db.user.update({
    where: { id: userId },
    data: { status: "REVOKED" },
  });
  revalidatePath("/admin/users");
}

export async function deleteUser(userId: string) {
  const me = await ensureAdmin();
  if (userId === me.id) {
    throw new Error("Tu ne peux pas supprimer ton propre compte");
  }
  await db.user.delete({ where: { id: userId } });
  revalidatePath("/admin/users");
}

const roleSchema = z.enum(["ADMIN", "CHEF", "CLIENT"]);

export async function changeUserRole(userId: string, role: string) {
  const me = await ensureAdmin();
  const parsed = roleSchema.parse(role);

  if (userId === me.id && parsed !== "ADMIN") {
    throw new Error("Tu ne peux pas te retirer le rôle ADMIN à toi-même");
  }

  await db.user.update({
    where: { id: userId },
    data: { role: parsed },
  });
  revalidatePath("/admin/users");
}

/**
 * Génère un lien de réinitialisation de mot de passe pour un autre utilisateur.
 * Si SMTP est configuré, envoie l'email automatiquement.
 * Dans tous les cas, retourne le lien (pour que l'admin puisse le copier).
 */
export async function adminGenerateResetLink(userId: string): Promise<{
  url: string;
  expiresAt: Date;
  emailSent: boolean;
  userEmail: string;
}> {
  await ensureAdmin();
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("Utilisateur introuvable");

  const { url, expiresAt } = await createResetTokenForUser(user.id);

  let emailSent = false;
  if (isEmailConfigured()) {
    try {
      await sendEmail({
        to: user.email,
        subject: "Réinitialisation de ton mot de passe Autonhome",
        text:
          `Bonjour ${user.name},\n\n` +
          `Un administrateur a déclenché une réinitialisation de ton mot de passe.\n` +
          `Ouvre ce lien pour définir un nouveau mot de passe :\n\n` +
          `${url}\n\n` +
          `Lien valide jusqu'au ${expiresAt.toLocaleString("fr-FR")}.\n\n— Autonhome`,
        html: `
          <p>Bonjour ${escapeHtml(user.name)},</p>
          <p>Un administrateur a déclenché une réinitialisation de ton mot de passe Autonhome.</p>
          <p><a href="${url}" style="display:inline-block;background:#135858;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Définir un nouveau mot de passe</a></p>
          <p style="color:#666;font-size:13px">Lien valide jusqu'au ${expiresAt.toLocaleString("fr-FR")}.</p>
        `,
      });
      emailSent = true;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[admin reset] échec envoi email", e);
    }
  }

  revalidatePath("/admin/users");
  return { url, expiresAt, emailSent, userEmail: user.email };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Met à jour la liste des chantiers visibles par un client (M2M).
 * Réservé aux admins. Le user doit avoir le rôle CLIENT pour que ça
 * ait du sens, mais on n'empêche pas techniquement (admin peut aussi
 * être lié, si un jour on veut une dimension "favoris").
 */
export async function setClientChantiers(
  userId: string,
  chantierIds: string[]
) {
  await ensureAdmin();
  const safeIds = (chantierIds ?? []).filter(
    (s) => typeof s === "string" && s.length > 0
  );
  await db.user.update({
    where: { id: userId },
    data: {
      chantiersClient: {
        set: safeIds.map((id) => ({ id })),
      },
    },
  });
  revalidatePath("/admin/users");
}
