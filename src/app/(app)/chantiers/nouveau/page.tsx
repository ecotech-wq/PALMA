import { db } from "@/lib/db";
import { Card, CardBody } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { ChantierForm } from "../ChantierForm";
import { createChantier } from "../actions";
import { requireAuth } from "@/lib/auth-helpers";

export default async function NouveauChantierPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const me = await requireAuth();
  const chefs = await db.user.findMany({
    where: { role: "CHEF" },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader
        title={type === "ETUDE" ? "Nouvelle étude" : "Nouveau chantier"}
        backHref={type === "ETUDE" ? "/be" : "/chantiers"}
      />
      <Card>
        <CardBody>
          <ChantierForm
            chefs={chefs}
            action={createChantier}
            submitLabel="Créer"
            isAdmin={me.isAdmin}
            defaultType={type === "ETUDE" ? "ETUDE" : "CHANTIER"}
          />
        </CardBody>
      </Card>
    </div>
  );
}
