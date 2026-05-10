import Link from "next/link";
import { notFound } from "next/navigation";
import { Trash2, ArrowRight, ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { MaterielForm } from "../MaterielForm";
import { MaterielStatutBadge } from "../MaterielStatutBadge";
import { ResettingForm } from "@/components/ResettingForm";
import { updateMateriel, deleteMateriel, addAccessoire, deleteAccessoire } from "../actions";
import { formatDate } from "@/lib/utils";

const etatLabel: Record<string, string> = {
  BON: "Bon",
  USE: "Usé",
  CASSE: "Cassé",
  MANQUANT: "Manquant",
};

export default async function MaterielDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const materiel = await db.materiel.findUnique({
    where: { id },
    include: {
      accessoires: { orderBy: { type: "asc" } },
      sorties: {
        include: {
          equipe: { select: { id: true, nom: true } },
          chantier: { select: { id: true, nom: true } },
        },
        orderBy: { dateSortie: "desc" },
        take: 10,
      },
    },
  });
  if (!materiel) notFound();

  const updateAction = updateMateriel.bind(null, id);
  const addAccAction = addAccessoire.bind(null, id);
  const deleteAction = deleteMateriel.bind(null, id);
  const sortieEnCours = materiel.sorties.find((s) => !s.dateRetour);

  return (
    <div>
      <PageHeader
        title={materiel.nomCommun}
        description={[materiel.marque, materiel.modele].filter(Boolean).join(" ")}
        backHref="/materiel"
        action={
          <div className="flex items-center gap-2">
            <MaterielStatutBadge statut={materiel.statut} />
            {materiel.statut === "DISPO" && (
              <Link href="/sorties/nouvelle">
                <Button size="sm">
                  <ArrowRight size={14} />
                  <span className="hidden sm:inline">Sortir</span>
                </Button>
              </Link>
            )}
            {sortieEnCours && (
              <Link href="/sorties">
                <Button size="sm" variant="secondary">
                  <ArrowLeft size={14} />
                  <span className="hidden sm:inline">Marquer rentré</span>
                </Button>
              </Link>
            )}
            <form action={deleteAction}>
              <Button type="submit" variant="danger" size="sm">
                <Trash2 size={14} />
              </Button>
            </form>
          </div>
        }
      />

      <div className="space-y-5">
        <Card>
          <CardBody>
            <MaterielForm
              materiel={{
                id: materiel.id,
                nomCommun: materiel.nomCommun,
                marque: materiel.marque,
                modele: materiel.modele,
                numeroSerie: materiel.numeroSerie,
                statut: materiel.statut,
                possesseur: materiel.possesseur,
                prixAchat: materiel.prixAchat ? String(materiel.prixAchat) : null,
                dateAchat: materiel.dateAchat,
                notes: materiel.notes,
                photo: materiel.photo,
              }}
              action={updateAction}
              submitLabel="Enregistrer"
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Accessoires</CardTitle>
          </CardHeader>
          <CardBody>
            {materiel.accessoires.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-500 mb-4">
                Ajoute les embouts, batteries, chargeurs, mèches… qui vont avec.
              </p>
            )}

            {materiel.accessoires.length > 0 && (
              <div className="mb-5 divide-y divide-slate-100 dark:divide-slate-800">
                {materiel.accessoires.map((a) => {
                  const remove = deleteAccessoire.bind(null, a.id, id);
                  return (
                    <div key={a.id} className="py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          <span className="text-slate-500 dark:text-slate-500 mr-2">{a.type}</span>
                          {a.nom}
                          {a.quantite > 1 && (
                            <span className="text-slate-400 dark:text-slate-500 ml-2">×{a.quantite}</span>
                          )}
                        </div>
                        {a.note && <div className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">{a.note}</div>}
                      </div>
                      <form action={remove}>
                        <button
                          type="submit"
                          className="text-slate-400 dark:text-slate-500 hover:text-red-600 p-1"
                          aria-label="Supprimer"
                        >
                          <Trash2 size={16} />
                        </button>
                      </form>
                    </div>
                  );
                })}
              </div>
            )}

            <ResettingForm
              action={addAccAction}
              successMessage="Accessoire ajouté"
              className="grid grid-cols-1 sm:grid-cols-12 gap-2"
            >
              <div className="sm:col-span-3">
                <Input name="type" placeholder="Type (Embout, Batterie...)" required />
              </div>
              <div className="sm:col-span-4">
                <Input name="nom" placeholder="Nom (PH2 50mm, 18V 5Ah...)" required />
              </div>
              <div className="sm:col-span-2">
                <Input name="quantite" type="number" min="1" defaultValue="1" />
              </div>
              <div className="sm:col-span-2">
                <Input name="note" placeholder="Note" />
              </div>
              <div className="sm:col-span-1">
                <Button type="submit" className="w-full">
                  +
                </Button>
              </div>
            </ResettingForm>
          </CardBody>
        </Card>

        {materiel.sorties.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Historique des sorties</CardTitle>
            </CardHeader>
            <CardBody className="!p-0">
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {materiel.sorties.map((s) => (
                  <li key={s.id} className="px-5 py-3 text-sm flex flex-wrap items-center gap-2">
                    <span className="text-slate-400 dark:text-slate-500 text-xs shrink-0">
                      {formatDate(s.dateSortie)}
                    </span>
                    {s.equipe && (
                      <Link href={`/equipes/${s.equipe.id}`} className="hover:underline">
                        <Badge color="blue">{s.equipe.nom}</Badge>
                      </Link>
                    )}
                    {s.chantier && (
                      <Link href={`/chantiers/${s.chantier.id}`} className="hover:underline">
                        <Badge color="orange">{s.chantier.nom}</Badge>
                      </Link>
                    )}
                    <span className="ml-auto text-xs text-slate-500 dark:text-slate-500">
                      {s.dateRetour ? (
                        <>
                          rentré {formatDate(s.dateRetour)}
                          {s.etatRetour && (
                            <span className="ml-2 text-slate-400 dark:text-slate-500">({etatLabel[s.etatRetour]})</span>
                          )}
                        </>
                      ) : (
                        <Badge color="yellow">En cours</Badge>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
