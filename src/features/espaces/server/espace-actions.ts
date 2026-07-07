"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth-helpers";
import { COOKIE_ESPACE, TOUS_ESPACES } from "@/lib/espaces";

// ─── Bascule d'espace (le sélecteur d'entreprise, façon Odoo) ───────────────

export async function changerEspace(espaceId: string) {
  const me = await requireAuth();
  // On ne bascule que vers un espace dont on est membre (ou « tous »
  // quand on appartient à plusieurs espaces).
  const autorise =
    (espaceId === TOUS_ESPACES && me.espaces.length > 1) ||
    me.espaces.some((e) => e.id === espaceId);
  if (!autorise) throw new Error("Espace inconnu ou non autorisé");

  const jar = await cookies();
  jar.set(COOKIE_ESPACE, espaceId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 365 * 24 * 3600,
  });
  // Tout le contenu dépend de l'espace : on revalide la racine du groupe.
  revalidatePath("/", "layout");
}
