import { db } from "@/lib/db";
import { Card, CardBody } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { DemandeForm } from "../DemandeForm";
import { createDemande } from "../actions";
import { requireAuth } from "@/lib/auth-helpers";

export default async function NouvelleDemandePage({
  searchParams,
}: {
  searchParams: Promise<{ chantierId?: string }>;
}) {
  await requireAuth();
  const { chantierId } = await searchParams;
  const chantiers = await db.chantier.findMany({
    where: { statut: { in: ["EN_COURS", "PAUSE", "PLANIFIE"] } },
    select: { id: true, nom: true },
    orderBy: { nom: "asc" },
  });

  return (
    <div>
      <PageHeader title="Nouvelle demande de matériel" backHref="/demandes" />
      <Card>
        <CardBody>
          <DemandeForm
            chantiers={chantiers}
            defaultChantierId={chantierId}
            action={createDemande}
          />
        </CardBody>
      </Card>
    </div>
  );
}
