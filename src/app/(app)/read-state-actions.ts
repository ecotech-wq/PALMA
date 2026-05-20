"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth-helpers";
import { markResourceRead } from "@/lib/read-state";

/**
 * Marque une ressource comme "lue maintenant" pour l'utilisateur courant.
 * Appelée depuis les pages au chargement (via un Effect ou directement
 * depuis le server component avec un side-effect).
 *
 * Conventions :
 *   - "chantier:<id>"  → messagerie d'un chantier
 *   - "incidents"      → liste globale incidents
 *   - "demandes"       → liste globale demandes matériel
 */
export async function markRead(resource: string) {
  const me = await requireAuth();
  await markResourceRead(me.id, resource);
  // Le badge dans la sidebar est calculé au render du layout,
  // on revalide pour qu'il se mette à jour à la prochaine navigation.
  revalidatePath("/", "layout");
}
