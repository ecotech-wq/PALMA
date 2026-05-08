"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { db } from "@/lib/db";

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
