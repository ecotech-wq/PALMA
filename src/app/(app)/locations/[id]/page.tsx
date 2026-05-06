import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Input, Field, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { LocationForm } from "../LocationForm";
import { updateLocation, deleteLocation, cloturerLocation } from "../actions";
import { formatEuro, formatDate } from "@/lib/utils";

export default async function LocationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [location, chantiers] = await Promise.all([
    db.locationPret.findUnique({ where: { id } }),
    db.chantier.findMany({
      where: { statut: { in: ["PLANIFIE", "EN_COURS", "PAUSE", "TERMINE"] } },
      select: { id: true, nom: true },
      orderBy: { nom: "asc" },
    }),
  ]);
  if (!location) notFound();

  const updateAction = updateLocation.bind(null, id);
  const deleteAction = deleteLocation.bind(null, id);
  const cloturerAction = cloturerLocation.bind(null, id);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <PageHeader
        title={location.designation}
        description={`${location.type === "LOCATION" ? "Location" : "Prêt"} chez ${location.fournisseurNom}`}
        backHref="/locations"
        action={
          <div className="flex items-center gap-2">
            {location.cloture && <Badge color="green">Clôturée</Badge>}
            {!location.cloture && new Date(location.dateFinPrevue) < new Date() && (
              <Badge color="red">En retard</Badge>
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
        {!location.cloture && (
          <Card className="border-amber-200 bg-amber-50">
            <CardHeader>
              <CardTitle>Clôturer (matériel rendu)</CardTitle>
            </CardHeader>
            <CardBody>
              <form action={cloturerAction} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-3">
                  <Field label="Date de retour réel" required>
                    <Input name="dateRetourReel" type="date" defaultValue={today} required />
                  </Field>
                </div>
                <div className="sm:col-span-3">
                  <Field label="Coût total final (€)" hint="Si différent">
                    <Input
                      name="coutTotalFinal"
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={location.coutTotal.toString()}
                    />
                  </Field>
                </div>
                <div className="sm:col-span-4">
                  <Field label="Note retour">
                    <Input name="note" placeholder="État, casse..." />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Button type="submit" className="w-full">
                    Clôturer
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Informations</CardTitle>
          </CardHeader>
          <CardBody>
            <LocationForm
              location={{
                designation: location.designation,
                type: location.type,
                fournisseurNom: location.fournisseurNom,
                chantierId: location.chantierId,
                dateDebut: location.dateDebut,
                dateFinPrevue: location.dateFinPrevue,
                coutJour: String(location.coutJour),
                coutTotal: String(location.coutTotal),
                note: location.note,
              }}
              chantiers={chantiers}
              action={updateAction}
              submitLabel="Enregistrer"
            />
          </CardBody>
        </Card>

        {location.cloture && (
          <Card>
            <CardHeader>
              <CardTitle>Récapitulatif</CardTitle>
            </CardHeader>
            <CardBody className="text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-500">Période réelle</span>
                <span className="font-medium">
                  {formatDate(location.dateDebut)} → {formatDate(location.dateRetourReel)}
                </span>
              </div>
              {location.type === "LOCATION" && (
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-500">Coût total</span>
                  <span className="font-semibold">{formatEuro(location.coutTotal.toString())}</span>
                </div>
              )}
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
