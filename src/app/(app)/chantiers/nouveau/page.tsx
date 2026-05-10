import { db } from "@/lib/db";
import { Card, CardBody } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { ChantierForm } from "../ChantierForm";
import { createChantier } from "../actions";
import { requireAuth } from "@/lib/auth-helpers";

export default async function NouveauChantierPage() {
  const me = await requireAuth();
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
          <ChantierForm
            chefs={chefs}
            action={createChantier}
            submitLabel="Créer"
            isAdmin={me.isAdmin}
          />
        </CardBody>
      </Card>
    </div>
  );
}
