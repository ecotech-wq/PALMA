import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Card, CardBody } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { LocationForm } from "../LocationForm";
import { createLocation } from "../actions";
import { requireAuth, espaceFilter } from "@/lib/auth-helpers";

export default async function NouvelleLocationPage() {
  // Garde de page + bornage d'espace (audit 2026-07-17) : le sélecteur de
  // chantiers listait toutes les entreprises.
  const me = await requireAuth();
  if (!me.canPilot) redirect("/aujourdhui");
  const chantiers = await db.chantier.findMany({
    where: {
      statut: { in: ["PLANIFIE", "EN_COURS", "PAUSE"] },
      ...espaceFilter(me),
    },
    select: { id: true, nom: true },
    orderBy: { nom: "asc" },
  });

  return (
    <div>
      <PageHeader title="Nouvelle location / prêt" backHref="/locations" />
      <Card>
        <CardBody>
          <LocationForm chantiers={chantiers} action={createLocation} submitLabel="Enregistrer" />
        </CardBody>
      </Card>
    </div>
  );
}
