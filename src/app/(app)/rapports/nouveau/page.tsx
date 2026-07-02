import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { Card, CardBody } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { RapportForm } from "../RapportForm";
import { createRapport } from "../actions";
import {
  requireAuth,
  getAccessibleChantierIds,
} from "@/lib/auth-helpers";

/**
 * Page globale pour créer un rapport sans passer par la fiche d'un
 * chantier. Un seul écran (audit UX n°7) : si un seul chantier est
 * accessible on saute directement au formulaire ; sinon le choix du
 * chantier est une liste à un geste, pas un sélecteur + Continuer.
 */
export default async function NouveauRapportPage({
  searchParams,
}: {
  searchParams: Promise<{ chantierId?: string }>;
}) {
  const me = await requireAuth();
  const accessibleIds = await getAccessibleChantierIds(me);
  const { chantierId } = await searchParams;

  const chantiers = await db.chantier.findMany({
    where: {
      ...(accessibleIds !== null ? { id: { in: accessibleIds } } : {}),
      statut: { in: ["EN_COURS", "PAUSE", "PLANIFIE", "TERMINE"] },
    },
    select: { id: true, nom: true, statut: true },
    orderBy: [{ statut: "asc" }, { nom: "asc" }],
  });

  // Un seul chantier accessible (cas type du chef) : aucun choix à faire
  if (!chantierId && chantiers.length === 1) {
    redirect(`/rapports/nouveau?chantierId=${chantiers[0].id}`);
  }

  return (
    <div>
      <PageHeader title="Nouveau rapport de chantier" backHref="/rapports" />

      {!chantierId ? (
        <Card className="max-w-xl">
          <CardBody className="!p-0">
            {chantiers.length === 0 ? (
              <p className="p-5 text-sm text-slate-600 dark:text-slate-400">
                Aucun chantier accessible. Crée d&apos;abord un chantier ou
                fais-toi assigner.
              </p>
            ) : (
              <>
                <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  Sur quel chantier ?
                </p>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {chantiers.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/rapports/nouveau?chantierId=${c.id}`}
                        className="flex items-center gap-3 px-4 py-3 text-sm transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
                      >
                        <span className="min-w-0 flex-1 truncate font-medium text-slate-800 dark:text-slate-200">
                          {c.nom}
                        </span>
                        <ChevronRight
                          size={16}
                          className="shrink-0 text-slate-300 dark:text-slate-600"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              Chantier :{" "}
              <strong>
                {chantiers.find((c) => c.id === chantierId)?.nom ??
                  "Inconnu"}
              </strong>
            </p>
            <RapportForm chantierId={chantierId} action={createRapport} />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
