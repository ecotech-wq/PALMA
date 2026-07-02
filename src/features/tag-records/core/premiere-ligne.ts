/**
 * Extrait la première ligne non vide d'un texte et la tronque à `max`
 * caractères (80 par défaut). Sert à fabriquer le titre d'une fiche
 * (incident, tâche) à partir du corps d'un message du fil.
 *
 * Renvoie une chaîne vide si le texte ne contient aucun caractère utile :
 * c'est à l'appelant de décider du repli (valeur par défaut ou erreur).
 */
export function premiereLigne(texte: string, max = 80): string {
  const ligne = texte
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!ligne) return "";
  return ligne.slice(0, max);
}
