"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { consumeResetToken } from "@/lib/password-reset";

const schema = z.object({
  token: z.string().min(10),
  password: z.string().min(8, "Mot de passe : 8 caractères minimum"),
  passwordConfirm: z.string().min(1),
});

export async function performPasswordReset(formData: FormData) {
  const parsed = schema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    passwordConfirm: formData.get("passwordConfirm"),
  });

  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Formulaire invalide";
    redirect(
      "/reset-password?token=" +
        encodeURIComponent(String(formData.get("token") ?? "")) +
        "&error=" +
        encodeURIComponent(msg)
    );
  }

  if (parsed.data.password !== parsed.data.passwordConfirm) {
    redirect(
      "/reset-password?token=" +
        encodeURIComponent(parsed.data.token) +
        "&error=" +
        encodeURIComponent("Les mots de passe ne correspondent pas")
    );
  }

  const consumed = await consumeResetToken(parsed.data.token);
  if (!consumed) {
    redirect("/reset-password?invalid=1");
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await db.user.update({
    where: { id: consumed.userId },
    data: { passwordHash },
  });

  redirect("/login?reset=1");
}
