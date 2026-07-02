/**
 * Renvoie le jour de `reference` (aujourd'hui par défaut) en convention
 * "jour UTC" du repo : minuit UTC du jour civil local, soit
 * new Date(Date.UTC(annee, mois, jour)). C'est le format attendu par les
 * colonnes Prisma @db.Date (Tache.dateDebut, Tache.dateFin...), qui ne
 * stockent que la date sans heure.
 */
export function aujourdhuiUtc(reference: Date = new Date()): Date {
  return new Date(
    Date.UTC(
      reference.getFullYear(),
      reference.getMonth(),
      reference.getDate()
    )
  );
}
