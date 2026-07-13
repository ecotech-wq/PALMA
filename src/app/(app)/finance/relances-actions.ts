"use server";

import { revalidatePath } from "next/cache";
import { requireAdminOrConducteur } from "@/lib/auth-helpers";
import { executerRelances, type BilanRelances } from "@/lib/relances";

// ─── Relances financières : action à la demande ──────────────────────────────
// Fichier séparé de actions.ts : le moteur (lib/relances) a ses propres
// dépendances (notifications, journal RelanceLog) et l'action ne partage rien
// avec les mutations de suivi. Garde de pilotage (ADMIN + CONDUCTEUR), comme
// le layout du module finance.

/**
 * Lance le balayage des relances à la demande (bouton du cockpit /finance).
 * Même moteur que le cron quotidien : classification par paliers, journal
 * RelanceLog (idempotent : un objet n'est signalé qu'une fois par palier),
 * notifications internes aux pilotes de l'espace. Retourne le bilan pour le
 * toast de l'UI. Le balayage est BORNÉ aux espaces de l'appelant (le bilan
 * affiché ne mélange pas les entreprises) ; seul le cron balaye en global.
 */
export async function lancerAnalyseRelances(): Promise<BilanRelances> {
  const me = await requireAdminOrConducteur();
  const bilan = await executerRelances(new Date(), me.espaceIds);
  revalidatePath("/finance");
  return bilan;
}
