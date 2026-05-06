import { db } from "@/lib/db";
import { Card, CardBody } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { ChantierForm } from "../ChantierForm";
import { createChantier } from "../actions";

export default async function NouveauChantierPage() {
  const chefs = await db.user.findMany({
    where: { role: "CHEF" },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader title="Nouveau chantier" backHref="/chantiers" />
      <Card>
        <CardBody>
          <ChantierForm chefs={chefs} action={createChantier} submitLabel="Créer" />
        </CardBody>
      </Card>
    </div>
  );
}
