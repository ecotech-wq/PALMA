import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, X, Trash2, Save, Undo2 } from "lucide-react";
import { db } from "@/lib/db";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Field, Input, Select } from "@/components/ui/Input";
import {
  marquerPaye,
  marquerEnAttente,
  annulerPaiement,
  updatePaiementMeta,
  deletePaiement,
} from "../actions";
import { formatEuro, formatDate } from "@/lib/utils";

const contratLabel: Record<string, string> = {
  FIXE: "Salarié fixe",
  JOUR: "Au jour",
  SEMAINE: "À la semaine",
  MOIS: "Au mois",
  FORFAIT: "Forfait",
};

export default async function PaiementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const paiement = await db.paiement.findUnique({
    where: { id },
    include: {
      ouvrier: true,
      avances: true,
      retenuesOutils: { include: { outilPersonnel: { select: { nom: true } } } },
    },
  });
  if (!paiement) notFound();

  const fullName = [paiement.ouvrier.prenom, paiement.ouvrier.nom].filter(Boolean).join(" ");
  const payerAction = marquerPaye.bind(null, id);
  const enAttenteAction = marquerEnAttente.bind(null, id);
  const annulerAction = annulerPaiement.bind(null, id);
  const updateMetaAction = updatePaiementMeta.bind(null, id);
  const deleteAction = deletePaiement.bind(null, id);
  const editable = paiement.statut !== "ANNULE";

  // Pré-remplit l'input date au format yyyy-MM-dd
  const dateValue = new Date(paiement.date).toISOString().slice(0, 10);

  return (
    <div>
      <PageHeader
        title={`Paiement de ${fullName}`}
        description={`Du ${formatDate(paiement.periodeDebut)} au ${formatDate(paiement.periodeFin)}`}
        backHref="/paie"
        action={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {paiement.statut === "CALCULE" && (
              <>
                <Badge color="yellow">En attente</Badge>
                <form action={payerAction}>
                  <Button type="submit" size="sm">
                    <Check size={14} />
                    <span className="hidden sm:inline">Marquer payé</span>
                  </Button>
                </form>
                <form action={annulerAction}>
                  <Button type="submit" variant="outline" size="sm">
                    <X size={14} />
                    <span className="hidden sm:inline">Annuler</span>
                  </Button>
                </form>
              </>
            )}
            {paiement.statut === "PAYE" && (
              <>
                <Badge color="green">Payé</Badge>
                <form action={enAttenteAction}>
                  <Button type="submit" variant="outline" size="sm">
                    <Undo2 size={14} />
                    <span className="hidden sm:inline">Repasser en attente</span>
                  </Button>
                </form>
                <form action={annulerAction}>
                  <Button type="submit" variant="outline" size="sm">
                    <X size={14} />
                    <span className="hidden sm:inline">Annuler</span>
                  </Button>
                </form>
              </>
            )}
            {paiement.statut === "ANNULE" && <Badge color="red">Annulé</Badge>}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Décompte</CardTitle>
            </CardHeader>
            <CardBody>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-2">
                  <span className="text-slate-600 dark:text-slate-500">
                    {contratLabel[paiement.ouvrier.typeContrat]} ·{" "}
                    {Number(paiement.joursTravailles)} jour
                    {Number(paiement.joursTravailles) > 1 ? "s" : ""}
                  </span>
                  <span className="font-medium">{formatEuro(paiement.montantBrut.toString())}</span>
                </div>

                {Number(paiement.avancesDeduites) > 0 && (
                  <div className="flex justify-between py-2 border-t border-slate-100">
                    <span className="text-slate-600 dark:text-slate-500">
                      Avances déduites ({paiement.avances.length})
                    </span>
                    <span className="font-medium text-orange-600">
                      -{formatEuro(paiement.avancesDeduites.toString())}
                    </span>
                  </div>
                )}

                {Number(paiement.retenueOutil) > 0 && (
                  <div className="flex justify-between py-2 border-t border-slate-100">
                    <span className="text-slate-600 dark:text-slate-500">
                      Retenue outils ({paiement.retenuesOutils.length})
                    </span>
                    <span className="font-medium text-orange-600">
                      -{formatEuro(paiement.retenueOutil.toString())}
                    </span>
                  </div>
                )}

                <div className="flex justify-between py-3 border-t-2 border-slate-200 dark:border-slate-800 text-lg">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">Net à verser</span>
                  <span
                    className={`font-bold ${
                      Number(paiement.montantNet) < 0 ? "text-red-600" : "text-slate-900 dark:text-slate-100"
                    }`}
                  >
                    {formatEuro(paiement.montantNet.toString())}
                  </span>
                </div>

                <div className="flex justify-between text-xs text-slate-500 dark:text-slate-500 pt-2 border-t border-slate-100">
                  <span>Mode</span>
                  <span>{paiement.mode === "ESPECES" ? "Espèces" : "Virement"}</span>
                </div>
              </div>
            </CardBody>
          </Card>

          {paiement.avances.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Avances réglées par ce paiement</CardTitle>
              </CardHeader>
              <CardBody className="!p-0">
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {paiement.avances.map((a) => (
                    <li key={a.id} className="px-5 py-2 flex items-center justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-500">
                        {formatDate(a.date)} · {a.mode === "ESPECES" ? "Espèces" : "Virement"}
                        {a.note && <span className="ml-2 italic text-slate-500 dark:text-slate-500">{a.note}</span>}
                      </span>
                      <span className="font-medium">{formatEuro(a.montant.toString())}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          {paiement.retenuesOutils.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Retenues outils personnels</CardTitle>
              </CardHeader>
              <CardBody className="!p-0">
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {paiement.retenuesOutils.map((r) => (
                    <li key={r.id} className="px-5 py-2 flex items-center justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-500">{r.outilPersonnel.nom}</span>
                      <span className="font-medium">{formatEuro(r.montant.toString())}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Ouvrier</CardTitle>
            </CardHeader>
            <CardBody>
              <Link
                href={`/ouvriers/${paiement.ouvrier.id}`}
                className="text-brand-600 hover:underline font-medium"
              >
                {fullName}
              </Link>
              <div className="text-sm text-slate-500 dark:text-slate-500 mt-1">
                {contratLabel[paiement.ouvrier.typeContrat]}
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-500">
                Tarif : {formatEuro(paiement.ouvrier.tarifBase.toString())}
              </div>
            </CardBody>
          </Card>

          {editable && (
            <Card>
              <CardHeader>
                <CardTitle>Modifier le paiement</CardTitle>
              </CardHeader>
              <CardBody>
                <form action={updateMetaAction} className="space-y-3">
                  <Field label="Date du paiement" required>
                    <Input
                      type="date"
                      name="date"
                      defaultValue={dateValue}
                      required
                    />
                  </Field>
                  <Field label="Mode de règlement" required>
                    <Select name="mode" defaultValue={paiement.mode}>
                      <option value="ESPECES">Espèces</option>
                      <option value="VIREMENT">Virement</option>
                    </Select>
                  </Field>
                  <Button type="submit" size="sm" className="w-full">
                    <Save size={14} />
                    Enregistrer
                  </Button>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                    Pour recalculer le montant (jours travaillés, avances,
                    retenues), supprime ce paiement et génère-le à nouveau.
                  </p>
                </form>
              </CardBody>
            </Card>
          )}

          {paiement.statut === "ANNULE" && (
            <Card className="bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900">
              <CardBody className="text-sm text-red-800 dark:text-red-300">
                Ce paiement a été annulé. Les avances et retenues outils ont été
                restaurées et sont à nouveau en cours.
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Supprimer définitivement</CardTitle>
            </CardHeader>
            <CardBody>
              <form action={deleteAction}>
                <Button
                  type="submit"
                  variant="danger"
                  size="sm"
                  className="w-full"
                >
                  <Trash2 size={14} />
                  Supprimer ce paiement
                </Button>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 italic mt-2">
                  {paiement.statut === "ANNULE"
                    ? "Suppression sèche : l'historique disparaît définitivement."
                    : "Les avances réglées et les retenues outils seront automatiquement restaurées (comme une annulation), puis le paiement sera supprimé."}
                </p>
              </form>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
