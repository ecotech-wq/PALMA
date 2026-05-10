import { db } from "@/lib/db";
import { Card, CardBody } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { CommandeForm } from "../CommandeForm";
import { createCommande } from "../actions";

export default async function NouvelleCommandePage({
  searchParams,
}: {
  searchParams: Promise<{ chantierId?: string; demandeId?: string }>;
}) {
  const { chantierId, demandeId } = await searchParams;

  // Si on vient d'une demande de matériel approuvée, on pré-remplit le
  // formulaire (chantier + ligne avec description/quantité, fournisseur).
  let prefill: {
    chantierId?: string;
    fournisseur?: string;
    initialLignes?: {
      designation: string;
      quantite: number;
      prixUnitaire: number;
    }[];
  } | null = null;
  if (demandeId) {
    const d = await db.demandeMateriel.findUnique({
      where: { id: demandeId },
    });
    if (d && d.statut === "APPROUVEE") {
      prefill = {
        chantierId: d.chantierId,
        fournisseur: d.fournisseur ?? "",
        initialLignes: [
          {
            designation: d.unite
              ? `${d.description} (${Number(d.quantite)} ${d.unite})`
              : d.description,
            quantite: Number(d.quantite),
            prixUnitaire: 0,
          },
        ],
      };
    }
  }

  const chantiers = await db.chantier.findMany({
    where: { statut: { in: ["PLANIFIE", "EN_COURS", "PAUSE"] } },
    select: { id: true, nom: true },
    orderBy: { nom: "asc" },
  });

  return (
    <div>
      <PageHeader
        title={demandeId ? "Commander depuis la demande" : "Nouvelle commande"}
        backHref={demandeId ? `/demandes/${demandeId}` : "/commandes"}
      />
      <Card>
        <CardBody>
          {demandeId && prefill && (
            <div className="mb-4 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 px-3 py-2 text-sm text-blue-800 dark:text-blue-300">
              Commande créée depuis une demande de matériel. Une fois validée,
              la demande sera marquée comme commandée automatiquement.
            </div>
          )}
          <CommandeForm
            chantiers={chantiers}
            defaultChantierId={prefill?.chantierId ?? chantierId}
            defaultFournisseur={prefill?.fournisseur}
            initialLignes={prefill?.initialLignes}
            demandeId={demandeId}
            action={createCommande}
            submitLabel="Enregistrer la commande"
          />
        </CardBody>
      </Card>
    </div>
  );
}
