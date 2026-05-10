import { db } from "@/lib/db";
import { Card, CardBody } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { OuvrierForm } from "../OuvrierForm";
import { createOuvrier } from "../actions";
import { requireAuth } from "@/lib/auth-helpers";

export default async function NouvelOuvrierPage() {
  const me = await requireAuth();
  const equipes = await db.equipe.findMany({
    select: { id: true, nom: true },
    orderBy: { nom: "asc" },
  });

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
