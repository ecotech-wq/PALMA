import "server-only";
import { db } from "@/lib/db";
import type { PipelineAffaire } from "@/generated/prisma/client";
import { MODELES_PAR_DEFAUT } from "@/lib/pipelines";

// ─── Procédures d'affaires : accès serveur ───────────────────────────────────
// La logique pure (palette, validation, parseurs) vit dans lib/pipelines.ts ;
// ici, uniquement le chargement borné par espace et le SEED PARESSEUX : un
// espace créé après la migration de backfill n'a aucun pipeline, on lui pose
// les 4 modèles par défaut à la première lecture. createMany(skipDuplicates)
// rend la course entre deux lectures simultanées inoffensive (l'unique
// [espaceId, cle] fait foi). Un espace ne peut pas se retrouver vidé par
// l'utilisateur : supprimerPipeline refuse de supprimer la dernière
// procédure, le seed ne ressuscite donc jamais des modèles supprimés.

/**
 * Pipelines d'UN espace, triés par ordre. Si l'espace n'en a aucun
 * (nouvel espace), les 4 modèles par défaut sont créés d'abord.
 */
export async function getPipelinesEspace(
  espaceId: string
): Promise<PipelineAffaire[]> {
  const tri = [{ ordre: "asc" as const }, { createdAt: "asc" as const }];
  const existants = await db.pipelineAffaire.findMany({
    where: { espaceId },
    orderBy: tri,
  });
  if (existants.length > 0) return existants;

  await db.pipelineAffaire.createMany({
    data: MODELES_PAR_DEFAUT.map((m, i) => ({
      espaceId,
      cle: m.cle,
      libelle: m.libelle,
      couleur: m.couleur,
      ordre: i,
      etapes: m.etapes.map((e) => ({ ...e })),
      checklistModele: m.checklistModele.map((p) => ({ ...p })),
      actif: true,
    })),
    skipDuplicates: true,
  });
  return db.pipelineAffaire.findMany({ where: { espaceId }, orderBy: tri });
}

/**
 * Pipelines de PLUSIEURS espaces (mode « tous »), dans l'ordre des espaces
 * donnés puis par ordre interne. null = régime hérité (aucune adhésion
 * connue) : pas de bornage, comme espaceFilter.
 */
export async function getPipelinesEspaces(
  espaceIds: string[] | null
): Promise<PipelineAffaire[]> {
  if (!espaceIds) {
    return db.pipelineAffaire.findMany({
      orderBy: [{ espaceId: "asc" }, { ordre: "asc" }, { createdAt: "asc" }],
    });
  }
  const listes = await Promise.all(espaceIds.map(getPipelinesEspace));
  return listes.flat();
}
