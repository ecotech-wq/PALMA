/**
 * Brique tag-records : le pont tag -> fiche de la messagerie v4.2.
 * Seule couche qui connaît le métier derrière un tag : poser "tache",
 * "incident" ou "reserve" sur un message crée la fiche correspondante.
 *
 * Toute consommation externe passe par cet index, jamais par les
 * fichiers internes.
 */

export { TAG_ADAPTERS, getAdapter } from "./registry";
export type {
  TagRecordAdapter,
  TagRecordContext,
  TagRecordResult,
} from "./registry";
