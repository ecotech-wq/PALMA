import { db } from "@/lib/db";
import { Card, CardBody } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { LocationForm } from "../LocationForm";
import { createLocation } from "../actions";

export default async function NouvelleLocationPage() {
  const chantiers = await db.chantier.findMany({
    where: { statut: { in: ["PLANIFIE", "EN_COURS", "PAUSE"] } },
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
