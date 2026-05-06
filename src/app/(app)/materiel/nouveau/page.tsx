import { Card, CardBody } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { MaterielForm } from "../MaterielForm";
import { createMateriel } from "../actions";

export default function NouveauMaterielPage() {
  return (
    <div>
      <PageHeader title="Nouveau matériel" backHref="/materiel" />
      <Card>
        <CardBody>
          <MaterielForm action={createMateriel} submitLabel="Créer" />
        </CardBody>
      </Card>
    </div>
  );
}
