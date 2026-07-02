/**
 * Registre des adaptateurs tag -> fiche.
 *
 * C'est la SEULE couche de la messagerie qui connaît le métier : poser un
 * tag sur un message crée la fiche correspondante (tâche, incident,
 * réserve) via l'adaptateur du code. Les droits sont vérifiés EN AMONT
 * par le catalogue de tags : les adaptateurs ne portent aucun requireX,
 * ils ne vérifient que leurs invariants propres.
 */

import { incidentAdapter } from "./adapters/incident-adapter";
import { reserveAdapter } from "./adapters/reserve-adapter";
import { tacheAdapter } from "./adapters/tache-adapter";

/** Contexte fourni à l'adaptateur : le message taggé, déjà validé en amont. */
export interface TagRecordContext {
  chantierId: string;
  messageId: string;
  texte: string;
  photos: string[];
  authorId: string | null;
  authorName: string;
}

/** Fiche créée par l'adaptateur, à matérialiser sur le MessageTag. */
export interface TagRecordResult {
  /** Nom du modèle Prisma créé (ex: "Incident", "Tache", "PvReserve"). */
  entity: string;
  entityId: string;
  /** URL interne de la fiche, pour le lien depuis le fil. */
  url: string;
  /** Résumé court en français pour le fil et les notifications. */
  resume: string;
}

export interface TagRecordAdapter {
  tagCode: string;
  createRecord(ctx: TagRecordContext): Promise<TagRecordResult>;
}

/** Catalogue fermé : un code de tag -> un adaptateur. */
export const TAG_ADAPTERS: Record<string, TagRecordAdapter> = {
  tache: tacheAdapter,
  incident: incidentAdapter,
  reserve: reserveAdapter,
};

/** Renvoie l'adaptateur d'un code de tag, ou throw si le code est inconnu. */
export function getAdapter(code: string): TagRecordAdapter {
  const adapter = TAG_ADAPTERS[code];
  if (!adapter) {
    throw new Error(`Aucune fiche associée au tag « ${code} »`);
  }
  return adapter;
}
