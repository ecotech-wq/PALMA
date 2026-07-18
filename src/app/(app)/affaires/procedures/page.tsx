import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPipelinesEspace } from "@/lib/pipelines-server";
import { parseEtapes } from "@/lib/pipelines";
import { ListeProcedures, type ProcedureLigne } from "./ListeProcedures";
import { NouvelleProcedure } from "./NouvelleProcedure";

// ─── Atelier des procédures (pipelines éditables), façon Pipedrive ──────────
// La liste des procédures de l'ENTREPRISE COURANTE : couleur, libellé,
// affaires en cours, active / inactive, réordonnancement. La création ouvre
// une feuille (nom, couleur, modèle de départ) puis l'édition fine (étapes,
// checklist modèle) se fait sur la page de détail. Réservé aux pilotes
// (ADMIN + CONDUCTEUR) : mêmes gardes que tout le module affaires.

export default async function ProceduresPage() {
  const me = await requireAuth();
  if (!me.canPilot) redirect("/aujourdhui");

  // Un espace courant UNIQUE est requis : une procédure appartient à une
  // entreprise, comme une affaire (requireEspaceCourant à l'écriture).
  const espace = me.espaceCourant;
  if (!espace) {
    return (
      <div>
        <PageHeader
          backHref="/affaires"
          title="Procédures"
          description="Les pipelines de vos affaires, entièrement modifiables."
        />
        <div className="rounded-xl border border-dashed border-slate-300 py-14 text-center dark:border-slate-700">
          <Building2 size={28} className="mx-auto mb-2 text-slate-400" />
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Choisissez d&apos;abord une entreprise dans le sélecteur
            d&apos;espace.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Chaque entreprise a ses propres procédures : le mode « tous »
            ne permet pas de savoir laquelle modifier.
          </p>
        </div>
      </div>
    );
  }

  const pipelines = await getPipelinesEspace(espace.id);

  // Compteurs par procédure : affaires EN COURS (badge de la liste) et
  // TOTAL (gating de la suppression), en deux requêtes agrégées.
  const [groupesEnCours, groupesTotaux] = await Promise.all([
    db.affaire.groupBy({
      by: ["pipelineId"],
      where: { espaceId: espace.id, statut: "EN_COURS" },
      _count: { _all: true },
    }),
    db.affaire.groupBy({
      by: ["pipelineId"],
      where: { espaceId: espace.id },
      _count: { _all: true },
    }),
  ]);
  const enCoursPar = new Map(
    groupesEnCours.map((g) => [g.pipelineId, g._count._all])
  );
  const totalPar = new Map(
    groupesTotaux.map((g) => [g.pipelineId, g._count._all])
  );

  const lignes: ProcedureLigne[] = pipelines.map((p) => ({
    id: p.id,
    libelle: p.libelle,
    couleur: p.couleur,
    actif: p.actif,
    nbEtapes: parseEtapes(p.etapes).length,
    nbEnCours: enCoursPar.get(p.id) ?? 0,
    nbTotal: totalPar.get(p.id) ?? 0,
  }));

  return (
    <div>
      <PageHeader
        backHref="/affaires"
        title="Procédures"
        description={`Les pipelines de ${espace.nom} : étapes, couleurs et pièces types, entièrement modifiables.`}
        action={<NouvelleProcedure />}
      />

      <ListeProcedures procedures={lignes} />

      <p className="mt-4 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        Une procédure inactive disparaît des onglets et de la création
        d&apos;affaire, son historique est préservé. La suppression
        n&apos;est possible que si aucune affaire, même terminée, ne
        s&apos;y rattache. Les procédures des autres entreprises se gèrent
        en changeant d&apos;espace dans le sélecteur, par exemple{" "}
        <Link href="/affaires" className="underline underline-offset-2">
          depuis la page Affaires
        </Link>
        .
      </p>
    </div>
  );
}
