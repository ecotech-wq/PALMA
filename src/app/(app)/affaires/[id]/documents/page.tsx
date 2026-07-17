import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-helpers";
import { Card, CardBody } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { parseChecklist } from "@/lib/affaires";
import { parseDossiersPerso } from "@/lib/ged-affaire";
import { DocumentsAffaire } from "./DocumentsAffaire";

// ─── Dossier client d'une affaire (GED d'affaire) ────────────────────────────
// Arborescence VIRTUELLE par catégorie (Photos, Pièces client, Conception,
// Devis, Livrables, Autres) : rien n'est créé physiquement, chaque document
// porte sa catégorie. Les pièces arrivent du fil de l'affaire (rangées à
// l'envoi, avec le lien vers le message d'origine) ou d'un dépôt direct ici.
// Réservé aux pilotes (ADMIN + CONDUCTEUR), frontière d'espace comme toute
// page du module affaires.

export default async function DossierClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await requireAuth();
  if (!me.canPilot) redirect("/aujourdhui");

  const affaire = await db.affaire.findUnique({
    where: { id },
    select: {
      id: true,
      espaceId: true,
      titre: true,
      checklist: true,
      dossiersPerso: true,
    },
  });
  if (!affaire) notFound();
  // Frontière d'espace : un id forgé d'un autre espace tombe sur un 404.
  if (me.espaceIds && !me.espaceIds.includes(affaire.espaceId)) notFound();

  const docs = await db.affaireDocument.findMany({
    where: { affaireId: id },
    orderBy: [{ categorie: "asc" }, { createdAt: "desc" }],
  });

  return (
    <div>
      <PageHeader
        title={`Dossier client · ${affaire.titre}`}
        description="Chaque pièce jointe du fil se range ici, dans le sous-dossier correspondant. Vous pouvez aussi déposer une pièce directement dans une catégorie."
        backHref={`/affaires/${id}`}
      />
      <Card>
        <CardBody>
          <DocumentsAffaire
            affaireId={id}
            docs={docs}
            checklist={parseChecklist(affaire.checklist)}
            dossiersPerso={parseDossiersPerso(affaire.dossiersPerso)}
          />
        </CardBody>
      </Card>
    </div>
  );
}
