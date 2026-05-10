import { db } from "@/lib/db";
import { Card, CardBody } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { IncidentForm } from "../IncidentForm";
import { createIncident } from "../actions";
import { requireAuth } from "@/lib/auth-helpers";

export default async function NouveauIncidentPage({
  searchParams,
}: {
  searchParams: Promise<{ chantierId?: string }>;
}) {
  await requireAuth();
  const { chantierId } = await searchParams;
  const chantiers = await db.chantier.findMany({
    select: { id: true, nom: true },
    orderBy: { nom: "asc" },
  });

  return (
    <div>
      <PageHeader title="Signaler un incident" backHref="/incidents" />
      <Card>
        <CardBody>
          <IncidentForm
            chantiers={chantiers}
            defaultChantierId={chantierId}
            action={createIncident}
          />
        </CardBody>
      </Card>
    </div>
  );
}
