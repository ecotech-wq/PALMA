import { db } from "@/lib/db";
import { Card, CardBody } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { CommandeForm } from "../CommandeForm";
import { createCommande } from "../actions";

export default async function NouvelleCommandePage({
  searchParams,
}: {
  searchParams: Promise<{ chantierId?: string }>;
}) {
  const { chantierId } = await searchParams;
  const chantiers = await db.chantier.findMany({
    where: { statut: { in: ["PLANIFIE", "EN_COURS", "PAUSE"] } },
    select: { id: true, nom: true },
    orderBy: { nom: "asc" },
  });

  return (
    <div>
      <PageHeader title="Nouvelle commande" backHref="/commandes" />
      <Card>
        <CardBody>
          <CommandeForm
            chantiers={chantiers}
            defaultChantierId={chantierId}
            action={createCommande}
            submitLabel="Enregistrer la commande"
          />
        </CardBody>
      </Card>
    </div>
  );
}
