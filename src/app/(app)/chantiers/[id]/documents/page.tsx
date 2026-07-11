import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Card, CardBody } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireAuth, requireChantierAccess } from "@/lib/auth-helpers";
import { DocumentsChantier } from "./DocumentsChantier";

// ─── Zone documentaire du chantier (GED) ────────────────────────────────────
// L'équipe voit tout et pilote visibilité / signature ; le client ne voit que
// les pièces ouvertes (visibleClient) et signe celles en attente.

export default async function DocumentsChantierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await requireAuth();
  await requireChantierAccess(me, id);

  const [chantier, docs] = await Promise.all([
    db.chantier.findUnique({
      where: { id },
      select: { id: true, nom: true },
    }),
    db.chantierDocument.findMany({
      where: {
        chantierId: id,
        ...(me.isClient ? { visibleClient: true } : {}),
      },
      orderBy: [{ categorie: "asc" }, { createdAt: "desc" }],
    }),
  ]);

  if (!chantier) notFound();

  return (
    <div>
      <PageHeader
        title={`Documents · ${chantier.nom}`}
        description={
          me.isClient
            ? "Les pièces du chantier partagées avec vous. Signez celles en attente."
            : "Plans, contrats, devis, factures, PV, rapports. Ouvrez une pièce au client ou envoyez-la en signature."
        }
        backHref={`/chantiers/${id}`}
      />

      <Card>
        <CardBody>
          <DocumentsChantier
            chantierId={id}
            isClient={me.isClient}
            docs={docs}
          />
        </CardBody>
      </Card>
    </div>
  );
}
