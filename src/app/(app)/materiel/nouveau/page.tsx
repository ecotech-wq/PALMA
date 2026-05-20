import { Card, CardBody } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { MaterielForm } from "../MaterielForm";
import { createMateriel } from "../actions";
import { requireAuth } from "@/lib/auth-helpers";

export default async function NouveauMaterielPage() {
  const me = await requireAuth();
  return (
    <div>
      <PageHeader title="Nouveau matériel" backHref="/materiel" />
      <Card>
        <CardBody>
          <MaterielForm
            action={createMateriel}
            submitLabel="Créer"
            canSeePrices={me.canSeePrices}
          />
        </CardBody>
      </Card>
    </div>
  );
}
