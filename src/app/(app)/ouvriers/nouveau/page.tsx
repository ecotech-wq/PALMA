import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Card, CardBody } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { OuvrierForm } from "../OuvrierForm";
import { createOuvrier } from "../actions";
import { requireAuth, espaceFilter } from "@/lib/auth-helpers";

export default async function NouvelOuvrierPage() {
  const me = await requireAuth();
  // Garde de page (audit 2026-07-17) : création réservée au pilotage.
  if (!me.canPilot) redirect("/aujourdhui");
  const equipes = await db.equipe.findMany({
    where: espaceFilter(me),
    select: { id: true, nom: true },
    orderBy: { nom: "asc" },
  });

  // Mode « tous les espaces » : createOuvrier exige une entreprise unique.
  // On invite à en choisir une au lieu d'un échec masqué à la soumission.
  if (me.espaceCourant === null) {
    return (
      <div>
        <PageHeader title="Nouvel ouvrier" backHref="/ouvriers" />
        <Card>
          <CardBody className="text-sm text-slate-600 dark:text-slate-400">
            Choisis d&apos;abord une entreprise dans le sélecteur pour créer
            un ouvrier (le mode « tous les espaces » ne permet pas de savoir
            à quelle entreprise le rattacher).
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Nouvel ouvrier" backHref="/ouvriers" />
      <Card>
        <CardBody>
          <OuvrierForm
            equipes={equipes}
            action={createOuvrier}
            submitLabel="Créer"
            isAdmin={me.isAdmin}
          />
        </CardBody>
      </Card>
    </div>
  );
}
