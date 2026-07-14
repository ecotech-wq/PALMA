/**
 * Regroupement des tâches racines de la vue Liste (façon Todoist) par
 * section, puis par rattachement pour le bloc « Sans section ». Module
 * pur, testable sans DOM ni base.
 *
 * Pourquoi l'éclatement par rattachement : chaque groupe rendu est un
 * contexte de drag-reorder indépendant, et `reordonnerTaches` refuse un
 * lot mêlant plusieurs rattachements (plusieurs chantiers, ou chantier
 * et perso). Avant l'éclatement, une seule tâche perso dans « Sans
 * section » suffisait à faire échouer tout réordonnancement du groupe
 * mixte (bug 2026-07-14).
 */

type TacheGroupable = {
  sectionId: string | null;
  /** null = tâche PERSO (sans chantier). */
  chantier: { id: string; nom: string } | null;
};

type SectionRef = { id: string };

export type GroupeListe<T, S> = {
  section: S | null;
  /** Titre affiché quand `section` est null et que « Sans section » est
   *  éclaté par rattachement ; null = en-tête générique. */
  titre: string | null;
  taches: T[];
};

/**
 * Ordre produit :
 *   1. Bloc(s) « Sans section » en tête : un seul bloc si toutes les
 *      tâches hors section partagent le même rattachement, sinon un bloc
 *      par chantier plus un bloc « Tâches perso » (ordre de première
 *      apparition, donc l'ordre serveur).
 *   2. Puis chaque section dans l'ordre reçu, sections vides incluses
 *      (pour permettre de drag dedans).
 */
export function groupBySections<T extends TacheGroupable, S extends SectionRef>(
  rootTaches: T[],
  sections: S[]
): GroupeListe<T, S>[] {
  const groups: GroupeListe<T, S>[] = [];
  const sansSection = rootTaches.filter((t) => !t.sectionId);

  const parRattachement = new Map<
    string,
    { chantierNom: string | null; taches: T[] }
  >();
  for (const t of sansSection) {
    const key = t.chantier ? t.chantier.id : "__perso__";
    let bucket = parRattachement.get(key);
    if (!bucket) {
      bucket = { chantierNom: t.chantier?.nom ?? null, taches: [] };
      parRattachement.set(key, bucket);
    }
    bucket.taches.push(t);
  }
  const buckets = [...parRattachement.values()];

  if (buckets.length === 1) {
    // Un seul rattachement (cas nominal : vue d'un seul chantier, ou
    // uniquement des perso) : l'en-tête générique « Sans section » suffit.
    groups.push({ section: null, titre: null, taches: buckets[0].taches });
  } else if (buckets.length > 1) {
    for (const b of buckets) {
      groups.push({
        section: null,
        titre: b.chantierNom
          ? `Sans section · ${b.chantierNom}`
          : "Tâches perso",
        taches: b.taches,
      });
    }
  } else if (sections.length === 0) {
    // Aucune tâche hors section et aucune section : un groupe vide pour
    // conserver l'état d'accueil historique de la liste.
    groups.push({ section: null, titre: null, taches: [] });
  }

  for (const s of sections) {
    groups.push({
      section: s,
      titre: null,
      taches: rootTaches.filter((t) => t.sectionId === s.id),
    });
  }
  return groups;
}
