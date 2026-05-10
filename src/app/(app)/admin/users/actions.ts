"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import bcrypt from "bcryptjs";
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

/**
 * Met à jour les flags de visibilité d'un client (admin contrôle ce
 * qu'il voit : journal, incidents, plans, rapports hebdo).
 */
export async function setClientVisibility(
  userId: string,
  flags: {
    showJournal?: boolean;
    showIncidents?: boolean;
    showPlans?: boolean;
    showRapportsHebdo?: boolean;
  }
) {
  await ensureAdmin();
  await db.user.update({
    where: { id: userId },
    data: {
      ...(flags.showJournal !== undefined && {
        showJournal: flags.showJournal,
      }),
      ...(flags.showIncidents !== undefined && {
        showIncidents: flags.showIncidents,
      }),
      ...(flags.showPlans !== undefined && { showPlans: flags.showPlans }),
      ...(flags.showRapportsHebdo !== undefined && {
        showRapportsHebdo: flags.showRapportsHebdo,
      }),
    },
  });
  revalidatePath("/admin/users");
}

// =====================================================
// Création d'un utilisateur par l'admin (avec invitation)
// =====================================================

const createUserSchema = z.object({
  name: z.string().min(1, "Nom requis").max(100),
  email: z.string().email("Email invalide").toLowerCase(),
  role: z.enum(["ADMIN", "CHEF", "CLIENT"]),
  chantierIds: z.array(z.string()).default([]),
});

/**
 * Crée un compte utilisateur ACTIVE avec un mot de passe aléatoire,
 * puis génère un lien de réinitialisation (valide 24h) qu'il pourra
 * utiliser pour définir son propre mot de passe.
 *
 * Retour : { url, expiresAt, emailSent } pour que l'admin puisse
 * copier le lien manuellement (et l'envoyer par WhatsApp/SMS) si
 * SMTP n'est pas configuré.
 */
export async function adminCreateUser(formData: FormData): Promise<{
  url: string;
  expiresAt: Date;
  emailSent: boolean;
  userEmail: string;
  userName: string;
}> {
  await ensureAdmin();

  const data = createUserSchema.parse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
    chantierIds: (formData.getAll("chantierIds") as string[]).filter(
      (s) => typeof s === "string" && s.length > 0
    ),
  });

  // Vérifie qu'il n'y a pas déjà un compte avec cet email
  const existing = await db.user.findUnique({
    where: { email: data.email },
  });
  if (existing) {
    throw new Error(`Un compte existe déjà pour ${data.email}`);
  }

  // Mot de passe random non-utilisable (l'utilisateur le redéfinira via le lien)
  const tempPassword = randomBytes(16).toString("hex");
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  const user = await db.user.create({
    data: {
      name: data.name,
      email: data.email,
      role: data.role,
      passwordHash,
      status: "ACTIVE",
      // Si CLIENT, on lie déjà les chantiers indiqués
      chantiersClient:
        data.role === "CLIENT" && data.chantierIds.length > 0
          ? { connect: data.chantierIds.map((id) => ({ id })) }
          : undefined,
    },
  });

  // Génère le lien d'invitation (= reset password 24h)
  const { url, expiresAt } = await createResetTokenForUser(user.id, 24 * 60);

  // Tente l'envoi email si SMTP configuré
  let emailSent = false;
  if (isEmailConfigured()) {
    try {
      await sendEmail({
        to: user.email,
        subject: "Invitation à rejoindre Autonhome",
        html: `
          <p>Bonjour ${escapeHtml(user.name)},</p>
          <p>Un compte vient d'être créé pour toi sur l'application Autonhome (gestion de chantier) avec le rôle <strong>${user.role}</strong>.</p>
          <p>Pour activer ton compte et définir ton mot de passe, clique sur le lien ci-dessous (valide 24h) :</p>
          <p><a href="${url}">${url}</a></p>
          <p>Une fois ton mot de passe défini, tu pourras te connecter avec l'email <strong>${escapeHtml(user.email)}</strong>.</p>
        `,
      });
      emailSent = true;
    } catch (e) {
      console.error("Email invite failed:", e);
    }
  }

  revalidatePath("/admin/users");
  return {
    url,
    expiresAt,
    emailSent,
    userEmail: user.email,
    userName: user.name,
  };
}
