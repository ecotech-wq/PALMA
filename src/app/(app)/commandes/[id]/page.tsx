import Link from "next/link";
import { notFound } from "next/navigation";
import { Trash2, Truck, Check } from "lucide-react";
import { db } from "@/lib/db";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { CommandeForm } from "../CommandeForm";
import { CommandeStatutBadge } from "../CommandeStatutBadge";
import {
  updateCommande,
  deleteCommande,
  changerStatutCommande,
} from "../actions";

export default async function CommandeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [commande, chantiers] = await Promise.all([
    db.commande.findUnique({
      where: { id },
      include: { chantier: true, lignes: true },
    }),
    db.chantier.findMany({
      where: { statut: { in: ["PLANIFIE", "EN_COURS", "PAUSE", "TERMINE"] } },
      select: { id: true, nom: true },
      orderBy: { nom: "asc" },
    }),
  ]);
  if (!commande) notFound();

  const updateAction = updateCommande.bind(null, id);
  const deleteAction = deleteCommande.bind(null, id);
  const livrerAction = changerStatutCommande.bind(null, id, "LIVREE", undefined);
  const enLivraisonAction = changerStatutCommande.bind(null, id, "EN_LIVRAISON", undefined);

  return (
    <div>
      <PageHeader
        title={`Commande ${commande.fournisseur}`}
        description={
          <>
            <Link href={`/chantiers/${commande.chantier.id}`} className="hover:underline">
              {commande.chantier.nom}
            </Link>
          </>
        }
        backHref="/commandes"
        action={
          <div className="flex items-center gap-2">
            <CommandeStatutBadge statut={commande.statut} />
            {commande.statut === "COMMANDEE" && (
              <form action={enLivraisonAction}>
                <Button type="submit" size="sm" variant="secondary">
                  <Truck size={14} />
                  <span className="hidden sm:inline">En livraison</span>
                </Button>
              </form>
            )}
            {(commande.statut === "COMMANDEE" || commande.statut === "EN_LIVRAISON") && (
              <form action={livrerAction}>
                <Button type="submit" size="sm">
                  <Check size={14} />
                  <span className="hidden sm:inline">Livrée</span>
                </Button>
              </form>
            )}
            <form action={deleteAction}>
              <Button type="submit" variant="danger" size="sm">
                <Trash2 size={14} />
              </Button>
            </form>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Informations</CardTitle>
        </CardHeader>
        <CardBody>
          <CommandeForm
            commande={{
              chantierId: commande.chantierId,
              fournisseur: commande.fournisseur,
              reference: commande.reference,
              dateCommande: commande.dateCommande,
              dateLivraisonPrevue: commande.dateLivraisonPrevue,
              statut: commande.statut,
              mode: commande.mode,
              note: commande.note,
              lignes: commande.lignes.map((l) => ({
                designation: l.designation,
                quantite: Number(l.quantite),
                prixUnitaire: Number(l.prixUnitaire),
              })),
            }}
            chantiers={chantiers}
            action={updateAction}
            submitLabel="Enregistrer"
          />
        </CardBody>
      </Card>
    </div>
  );
}
