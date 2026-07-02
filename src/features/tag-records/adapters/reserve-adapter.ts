/**
 * Adaptateur tag "reserve" : ajoute une PvReserve au PV de réception du
 * chantier (créé au passage s'il n'existe pas encore, un PV par chantier
 * via @@unique([chantierId])).
 *
 * Piège de concurrence identifié : le numéro de réserve est
 * (max numero du PV) + 1 et DOIT être calculé DANS la transaction qui
 * crée la réserve, sinon deux tags simultanés produisent un doublon.
 */

import { db } from "@/lib/db";
import { premiereLigne } from "../core/premiere-ligne";
import { prochainNumero } from "../core/prochain-numero";
import type { TagRecordAdapter } from "../registry";

export const reserveAdapter: TagRecordAdapter = {
  tagCode: "reserve",

  async createRecord({ chantierId, texte, photos }) {
    // PvReserve.texte est NOT NULL et décrit la non-conformité : un
    // message sans texte ne peut pas devenir une réserve.
    if (!texte.trim()) {
      throw new Error(
        "Le message doit contenir du texte pour créer une réserve"
      );
    }

    const reserve = await db.$transaction(async (tx) => {
      // Un seul PV de réception par chantier : on le crée à la volée si
      // le tag arrive avant l'ouverture formelle du PV.
      const pv = await tx.pvReception.upsert({
        where: { chantierId },
        update: {},
        create: { chantierId, dateReception: new Date() },
      });

      // Max numero lu DANS la transaction (voir en-tête du fichier).
      const agg = await tx.pvReserve.aggregate({
        where: { pvId: pv.id },
        _max: { numero: true },
      });
      const numero = prochainNumero(agg._max.numero);

      return tx.pvReserve.create({
        data: {
          pvId: pv.id,
          numero,
          texte,
          photos,
        },
      });
    });

    return {
      entity: "PvReserve",
      entityId: reserve.id,
      url: `/chantiers/${chantierId}/pv-reception`,
      resume: `Réserve n°${reserve.numero} : ${premiereLigne(texte)}`,
    };
  },
};
