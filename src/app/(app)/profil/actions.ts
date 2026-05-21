"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  generateTotpSecret,
  totpQrCodeDataUrl,
  verifyTotpToken,
  generateBackupCodes,
} from "@/lib/totp";
import { audit } from "@/lib/audit";

async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Non authentifié");
  }
  return session.user;
}

const profileSchema = z.object({
  name: z.string().min(2, "Nom trop court"),
  email: z.string().email("Email invalide"),
});

export async function updateProfile(formData: FormData) {
  const me = await getCurrentUser();
  const data = profileSchema.parse({
    name: formData.get("name"),
    email: formData.get("email"),
  });

  const newEmail = data.email.toLowerCase();
  if (newEmail !== me.email) {
    const existing = await db.user.findUnique({ where: { email: newEmail } });
    if (existing && existing.id !== me.id) {
      throw new Error("Un autre compte utilise déjà cet email");
    }
  }

  await db.user.update({
    where: { id: me.id },
    data: { name: data.name.trim(), email: newEmail },
  });
  revalidatePath("/profil");
}

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Mot de passe actuel requis"),
  newPassword: z.string().min(8, "Nouveau mot de passe : 8 caractères minimum"),
  newPasswordConfirm: z.string().min(1),
});

export async function changePassword(formData: FormData) {
  const me = await getCurrentUser();
  const data = passwordSchema.parse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    newPasswordConfirm: formData.get("newPasswordConfirm"),
  });

  if (data.newPassword !== data.newPasswordConfirm) {
    throw new Error("Les deux nouveaux mots de passe ne correspondent pas");
  }

  const user = await db.user.findUnique({ where: { id: me.id } });
  if (!user) throw new Error("Compte introuvable");

  const ok = await bcrypt.compare(data.currentPassword, user.passwordHash);
  if (!ok) throw new Error("Mot de passe actuel incorrect");

  const passwordHash = await bcrypt.hash(data.newPassword, 10);
  await db.user.update({ where: { id: me.id }, data: { passwordHash } });
  revalidatePath("/profil");
}

/* =====================================================================
 *  2FA TOTP
 *  Flux d'activation :
 *   1. startTotpEnrollment() — génère un secret + QR + backup codes,
 *      STOCKE le secret dans la DB mais garde totpEnabled=false. À
 *      afficher dans l'UI : QR à scanner + champ "code de vérification".
 *   2. confirmTotpEnrollment(code) — vérifie un premier code valide,
 *      active totpEnabled=true et persiste les hashes des backup codes.
 *   3. disableTotp(password) — désactive après vérif mot de passe.
 * ===================================================================== */

/** Renvoie l'état actuel du 2FA pour le profil courant. */
export async function getTotpStatus(): Promise<{
  enabled: boolean;
}> {
  const me = await getCurrentUser();
  const u = await db.user.findUnique({
    where: { id: me.id as string },
    select: { totpEnabled: true },
  });
  return { enabled: !!u?.totpEnabled };
}

/**
 * Démarre l'enrôlement TOTP. Si déjà activé, on refuse (il faut désactiver
 * d'abord pour éviter de perdre l'accès au secret précédent).
 * Renvoie le secret en clair + QR data URL ; les backup codes sont
 * générés à l'étape de confirmation (pas avant) pour éviter d'en montrer
 * sans confirmation.
 */
export async function startTotpEnrollment(): Promise<{
  qrDataUrl: string;
  secret: string;
}> {
  const me = await getCurrentUser();
  const u = await db.user.findUnique({
    where: { id: me.id as string },
    select: { totpEnabled: true, email: true },
  });
  if (!u) throw new Error("Compte introuvable");
  if (u.totpEnabled) {
    throw new Error("Le 2FA est déjà activé. Désactive-le d'abord.");
  }
  const secret = generateTotpSecret();
  const { qrDataUrl } = await totpQrCodeDataUrl(secret, u.email);
  // Stocke le secret tout de suite (pas encore actif) — permet à l'UI
  // de l'utiliser sur la prochaine étape sans avoir à le retransmettre.
  await db.user.update({
    where: { id: me.id as string },
    data: { totpSecret: secret, totpEnabled: false },
  });
  return { qrDataUrl, secret };
}

const confirmSchema = z.object({
  token: z.string().min(6).max(10),
});

/**
 * Confirme l'enrôlement TOTP en vérifiant un premier code valide.
 * En cas de succès : totpEnabled=true et 10 backup codes sont générés
 * et hashés en BDD. Renvoie les codes en clair (à afficher UNE seule
 * fois côté UI ; impossible de les récupérer ensuite).
 */
export async function confirmTotpEnrollment(
  formData: FormData
): Promise<{ backupCodes: string[] }> {
  const me = await getCurrentUser();
  const data = confirmSchema.parse({ token: formData.get("token") });

  const u = await db.user.findUnique({
    where: { id: me.id as string },
    select: {
      totpSecret: true,
      totpEnabled: true,
      name: true,
      role: true,
    },
  });
  if (!u || !u.totpSecret) {
    throw new Error("Aucun enrôlement en cours");
  }
  if (u.totpEnabled) throw new Error("Le 2FA est déjà activé");

  const ok = verifyTotpToken(u.totpSecret, data.token);
  if (!ok) throw new Error("Code invalide — vérifie ton authentificateur");

  const { plain, hashes } = generateBackupCodes(10);
  await db.user.update({
    where: { id: me.id as string },
    data: {
      totpEnabled: true,
      totpBackupCodes: hashes,
    },
  });

  await audit(
    { id: me.id as string, name: u.name, role: u.role },
    {
      action: "TOTP_ENABLED",
      entity: "User",
      entityId: me.id as string,
      summary: `2FA TOTP activé`,
    }
  );

  revalidatePath("/profil");
  return { backupCodes: plain };
}

const disableSchema = z.object({
  currentPassword: z.string().min(1),
});

/**
 * Désactive le 2FA après vérification du mot de passe courant. Efface
 * aussi le secret et les backup codes pour ne rien laisser traîner.
 */
export async function disableTotp(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  const data = disableSchema.parse({
    currentPassword: formData.get("currentPassword"),
  });
  const u = await db.user.findUnique({
    where: { id: me.id as string },
    select: { passwordHash: true, name: true, role: true },
  });
  if (!u) throw new Error("Compte introuvable");
  const ok = await bcrypt.compare(data.currentPassword, u.passwordHash);
  if (!ok) throw new Error("Mot de passe incorrect");

  await db.user.update({
    where: { id: me.id as string },
    data: {
      totpEnabled: false,
      totpSecret: null,
      totpBackupCodes: [],
    },
  });

  await audit(
    { id: me.id as string, name: u.name, role: u.role },
    {
      action: "TOTP_DISABLED",
      entity: "User",
      entityId: me.id as string,
      summary: `2FA TOTP désactivé`,
    }
  );

  revalidatePath("/profil");
}

/**
 * Régénère 10 nouveaux backup codes (invalide les anciens). Demande un
 * code TOTP courant en vérification.
 */
export async function regenerateBackupCodes(
  formData: FormData
): Promise<{ backupCodes: string[] }> {
  const me = await getCurrentUser();
  const data = confirmSchema.parse({ token: formData.get("token") });

  const u = await db.user.findUnique({
    where: { id: me.id as string },
    select: { totpSecret: true, totpEnabled: true },
  });
  if (!u?.totpEnabled || !u.totpSecret) {
    throw new Error("Le 2FA n'est pas activé");
  }
  const ok = verifyTotpToken(u.totpSecret, data.token);
  if (!ok) throw new Error("Code invalide");

  const { plain, hashes } = generateBackupCodes(10);
  await db.user.update({
    where: { id: me.id as string },
    data: { totpBackupCodes: hashes },
  });
  return { backupCodes: plain };
}
