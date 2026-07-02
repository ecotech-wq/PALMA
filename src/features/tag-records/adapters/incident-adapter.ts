/**
 * Adaptateur tag "incident" : crée un Incident à partir d'un message
 * taggé, en reproduisant la logique du bloc INCIDENT de
 * postChantierMessage (src/app/(app)/messagerie/actions.ts). On ne
 * réutilise PAS l'action existante : ses gardes (requireAuth,
 * requireChantierAccess) sont inadaptées ici, les droits sont vérifiés
 * en amont par le catalogue de tags.
 */

import { db } from "@/lib/db";
import { premiereLigne } from "../core/premiere-ligne";
import type { TagRecordAdapter } from "../registry";

export const incidentAdapter: TagRecordAdapter = {
  tagCode: "incident",

  async createRecord({ chantierId, texte, photos, authorId }) {
    // Incident.reporterId est NOT NULL (onDelete: Restrict) : impossible
    // de créer un incident sans auteur identifié.
    if (!authorId) throw new Error("Auteur introuvable");

    // Même repli que le bloc INCIDENT historique : un message sans texte
    // (photos seules) produit un incident intitulé "Incident".
    const titre = premiereLigne(texte) || "Incident";

    const incident = await db.incident.create({
      data: {
        chantierId,
        reporterId: authorId,
        titre,
        description: texte || titre,
        categorie: "AUTRE",
        gravite: "ATTENTION",
        photos,
      },
    });

    return {
      entity: "Incident",
      entityId: incident.id,
      url: `/incidents/${incident.id}`,
      resume: `Incident créé : ${titre}`,
    };
  },
};
