"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

const registerSchema = z.object({
  name: z.string().min(2, "Nom trop court"),
  email: z.string().email("Email invalide"),
  password: z.string().min(8, "Mot de passe : 8 caractères minimum"),
  passwordConfirm: z.string().min(1),
});

export async function registerAccount(formData: FormData) {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    passwordConfirm: formData.get("passwordConfirm"),
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0]?.message ?? "Formulaire invalide";
    redirect(`/register?error=${encodeURIComponent(issue)}`);
  }

  if (parsed.data.password !== parsed.data.passwordConfirm) {
    redirect("/register?error=" + encodeURIComponent("Les mots de passe ne correspondent pas"));
  }

  const email = parsed.data.email.toLowerCase();

  // Vérifie que l'email n'est pas déjà pris
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    redirect("/register?error=" + encodeURIComponent("Un compte existe déjà avec cet email"));
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  await db.user.create({
    data: {
      email,
      name: parsed.data.name.trim(),
      passwordHash,
      role: "CHEF",
      status: "PENDING",
    },
  });

  redirect("/login?registered=1");
}
