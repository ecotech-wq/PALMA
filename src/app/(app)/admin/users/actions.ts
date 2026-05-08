"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";

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

const roleSchema = z.enum(["ADMIN", "CHEF"]);

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
