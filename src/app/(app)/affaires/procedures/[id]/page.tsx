import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/ui/PageHeader";
import { parseChecklistModele, parseEtapes } from "@/lib/pipelines";
import { EditionProcedure } from "./EditionProcedure";

// ─── Détail d'une procédure : l'atelier d'édition ────────────────────────────
// Renommer, changer la couleur, activer / désactiver, supprimer ; éditer
// les ÉTAPES (ajouter à n'importe quelle position, renommer, réordonner,
// supprimer avec déplacement imposé des affaires) et le MODÈLE de
// checklist (les pièces types des futures affaires ; celles déjà créées
// gardent leur checklist propre). Pilotes uniquement, frontière d'espace.

export default async function ProcedureDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await requireAuth();
  if (!me.canPilot) redirect("/aujourdhui");

  const pipeline = await db.pipelineAffaire.findUnique({ where: { id } });
  if (!pipeline) notFound();
  // Frontière d'espace : un id forgé d'un autre espace tombe sur un 404
  // (pas de fuite d'existence), même règle que la fiche affaire.
  if (me.espaceIds && !me.espaceIds.includes(pipeline.espaceId)) notFound();

  // Affaires par étape (toutes, closes comprises : la suppression d'une
  // étape déplace TOUT ce qui pointe dessus) + compteurs de gating.
  const [groupes, nbEnCours, nbTotal] = await Promise.all([
    db.affaire.groupBy({
      by: ["etapeCle"],
      where: { pipelineId: pipeline.id },
      _count: { _all: true },
    }),
    db.affaire.count({
      where: { pipelineId: pipeline.id, statut: "EN_COURS" },
    }),
    db.affaire.count({ where: { pipelineId: pipeline.id } }),
  ]);
  const parEtape: Record<string, number> = {};
  for (const g of groupes) parEtape[g.etapeCle] = g._count._all;

  const etapes = parseEtapes(pipeline.etapes).map((e) => ({
    ...e,
    nbAffaires: parEtape[e.cle] ?? 0,
  }));

  return (
    <div>
      <PageHeader
        backHref="/affaires/procedures"
        title={pipeline.libelle}
        description={`${nbEnCours} affaire${nbEnCours > 1 ? "s" : ""} en cours · ${etapes.length} étape${etapes.length > 1 ? "s" : ""}`}
      />
      <EditionProcedure
        procedure={{
          id: pipeline.id,
          libelle: pipeline.libelle,
          couleur: pipeline.couleur,
          actif: pipeline.actif,
          nbEnCours,
          nbTotal,
        }}
        etapes={etapes}
        pieces={parseChecklistModele(pipeline.checklistModele)}
      />
    </div>
  );
}
