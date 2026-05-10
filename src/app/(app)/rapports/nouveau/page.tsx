import { db } from "@/lib/db";
import { Card, CardBody } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Field, Select } from "@/components/ui/Input";
import { RapportForm } from "../RapportForm";
import { createRapport } from "../actions";
import {
  requireAuth,
  getAccessibleChantierIds,
} from "@/lib/auth-helpers";

/**
 * Page globale pour créer un rapport sans passer par la fiche d'un
 * chantier. On choisit le chantier dans une étape préalable, puis on
 * affiche le formulaire pour ce chantier.
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

  return (
    <div>
      <PageHeader title="Nouveau rapport de chantier" backHref="/rapports" />

      {!chantierId ? (
        <Card>
          <CardBody>
            {chantiers.length === 0 ? (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Aucun chantier accessible. Crée d&apos;abord un chantier ou
                fais-toi assigner.
              </p>
            ) : (
              <form method="get" className="space-y-3">
                <Field label="Sur quel chantier ?" required>
                  <Select name="chantierId" defaultValue="" required>
                    <option value="" disabled>
                      Choisis un chantier…
                    </option>
                    {chantiers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nom}
                      </option>
                    ))}
                  </Select>
                </Field>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium"
                >
                  Continuer →
                </button>
              </form>
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
