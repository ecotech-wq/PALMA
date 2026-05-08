"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createResetTokenForUser } from "@/lib/password-reset";
import { sendEmail, isEmailConfigured } from "@/lib/email";

const schema = z.object({
  email: z.string().email("Email invalide"),
});

export async function requestPasswordReset(formData: FormData) {
  const parsed = schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    redirect(
      "/forgot-password?error=" +
        encodeURIComponent(parsed.error.issues[0]?.message ?? "Email invalide")
    );
  }

  const email = parsed.data.email.toLowerCase();
  const user = await db.user.findUnique({ where: { email } });

  // Anti-énumération : on répond toujours pareil, qu'il existe ou pas
  if (!user) {
    redirect("/forgot-password?sent=1");
  }

  // Les comptes PENDING/REVOKED ne peuvent pas reset
  if (user.status !== "ACTIVE") {
    redirect("/forgot-password?sent=1");
  }

  const { url, expiresAt } = await createResetTokenForUser(user.id);

  if (isEmailConfigured()) {
    try {
      await sendEmail({
        to: user.email,
        subject: "Réinitialisation de ton mot de passe Autonhome",
        text:
          `Bonjour ${user.name},\n\n` +
          `Une demande de réinitialisation de mot de passe a été faite pour ton compte Autonhome.\n` +
          `Pour définir un nouveau mot de passe, ouvre ce lien dans ton navigateur :\n\n` +
          `${url}\n\n` +
          `Ce lien expire le ${expiresAt.toLocaleString("fr-FR")}.\n\n` +
          `Si tu n'es pas à l'origine de cette demande, tu peux ignorer ce message.\n\n` +
          `— Autonhome`,
        html: `
          <p>Bonjour ${escapeHtml(user.name)},</p>
          <p>Une demande de réinitialisation de mot de passe a été faite pour ton compte Autonhome.</p>
          <p>Pour définir un nouveau mot de passe, clique sur ce lien :</p>
          <p><a href="${url}" style="display:inline-block;background:#135858;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Définir un nouveau mot de passe</a></p>
          <p style="color:#666;font-size:13px">Lien valide jusqu'au ${expiresAt.toLocaleString("fr-FR")}.</p>
          <p style="color:#666;font-size:13px">Si tu n'es pas à l'origine de cette demande, tu peux ignorer ce message.</p>
          <p style="color:#999;font-size:12px">— Autonhome</p>
        `,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[forgot-password] échec envoi email", e);
      // On ne révèle pas l'erreur à l'utilisateur — l'admin verra quand même
      // le lien dans /admin/users s'il en a besoin.
    }
  }

  redirect("/forgot-password?sent=1");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
