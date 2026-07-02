/**
 * Adaptateur tag "tache" : crée une Tache planifiée aujourd'hui à partir
 * d'un message taggé. Le modèle Tache exige dateDebut et dateFin NOT NULL
 * (@db.Date) : on pose les deux au jour courant en convention jour UTC,
 * la tâche sera replanifiée depuis le planning.
 *
 * Convention documentée : la Tache n'a pas de colonne photos, les photos
 * restent sur le JournalMessage taggé (même principe que DemandeMateriel).
 */

import { db } from "@/lib/db";
import { aujourdhuiUtc } from "../core/jour-utc";
import { premiereLigne } from "../core/premiere-ligne";
import type { TagRecordAdapter } from "../registry";

export const tacheAdapter: TagRecordAdapter = {
  tagCode: "tache",

  async createRecord({ chantierId, texte }) {
    // Tache.nom est NOT NULL et doit être parlant : un message sans texte
    // ne peut pas devenir une tâche.
    const nom = premiereLigne(texte);
    if (!nom) {
      throw new Error("Le message doit contenir du texte pour créer une tâche");
    }

    const jour = aujourdhuiUtc();
    const tache = await db.tache.create({
      data: {
        chantierId,
        nom,
        description: texte,
        dateDebut: jour,
        dateFin: jour,
        statut: "A_FAIRE",
        priorite: 4,
      },
    });

    return {
      entity: "Tache",
      entityId: tache.id,
      url: `/planning?chantier=${chantierId}`,
      resume: `Tâche créée : ${nom}`,
    };
  },
};
