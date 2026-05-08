import Link from "next/link";
import { notFound } from "next/navigation";
import { Trash2, Banknote, Wrench, Plus, ChevronRight, Calendar } from "lucide-react";
import { db } from "@/lib/db";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Input, Field, Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { OuvrierForm } from "../OuvrierForm";
import { PointageHistory } from "../PointageHistory";
import { MonthlyRecap } from "../MonthlyRecap";
import { PointageCalendar } from "../../pointage/PointageCalendar";
import { ResettingForm } from "@/components/ResettingForm";
import { updateOuvrier, deleteOuvrier } from "../actions";
import {
  addAvance,
  deleteAvance,
  addOutilPersonnel,
  deleteOutilPersonnel,
} from "../paie-actions";
import {
  updatePointage,
  deletePointage,
  savePointageBatch,
} from "../../pointage/actions";
import { formatEuro, formatDate } from "@/lib/utils";

export default async function OuvrierDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { id } = await params;
  const { month: monthParam } = await searchParams;
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  // Mois affiché dans le calendrier (par défaut : mois courant)
  const now = new Date();
  let calYear = now.getFullYear();
  let calMonthIdx = now.getMonth();
  if (monthParam) {
    const m = monthParam.match(/^(\d{4})-(\d{2})$/);
    if (m) {
      calYear = parseInt(m[1], 10);
      calMonthIdx = parseInt(m[2], 10) - 1;
    }
  }
  const calMonthStart = new Date(Date.UTC(calYear, calMonthIdx, 1));
  const calMonthEnd = new Date(Date.UTC(calYear, calMonthIdx + 1, 1));

  const [ouvrier, equipes, chantiers, pointages, pointagesRecap, pointagesCalendar] = await Promise.all([
    db.ouvrier.findUnique({
      where: { id },
      include: {
        avances: { orderBy: { date: "desc" } },
        outilsPersonnels: { orderBy: { dateAchat: "desc" } },
        paiements: {
          orderBy: { periodeDebut: "desc" },
          take: 5,
        },
        equipe: { select: { chantierId: true } },
      },
    }),
    db.equipe.findMany({ select: { id: true, nom: true }, orderBy: { nom: "asc" } }),
    db.chantier.findMany({
      where: { statut: { in: ["PLANIFIE", "EN_COURS", "PAUSE", "TERMINE"] } },
      select: { id: true, nom: true },
      orderBy: { nom: "asc" },
    }),
    // 60 derniers jours pour la liste éditable
    db.pointage.findMany({
      where: { ouvrierId: id, date: { gte: sixtyDaysAgo } },
      include: { chantier: { select: { nom: true } } },
      orderBy: { date: "desc" },
    }),
    // 6 derniers mois pour le récap (juste date + jours, pas de relation)
    db.pointage.findMany({
      where: { ouvrierId: id, date: { gte: sixMonthsAgo } },
      select: { date: true, joursTravailles: true },
    }),
    // Mois affiché dans le calendrier
    db.pointage.findMany({
      where: {
        ouvrierId: id,
        date: { gte: calMonthStart, lt: calMonthEnd },
      },
      select: { date: true, joursTravailles: true },
    }),
  ]);
  if (!ouvrier) notFound();

  const calendarInitial = pointagesCalendar.map((p) => ({
    date: p.date.toISOString().slice(0, 10),
    jours: Number(p.joursTravailles),
  }));

  const updateAction = updateOuvrier.bind(null, id);
  const deleteAction = deleteOuvrier.bind(null, id);
  const addAvanceAction = addAvance.bind(null, id);
  const addOutilAction = addOutilPersonnel.bind(null, id);
  const fullName = [ouvrier.prenom, ouvrier.nom].filter(Boolean).join(" ");
  const today = new Date().toISOString().slice(0, 10);

  const avancesNonReglees = ouvrier.avances.filter((a) => !a.reglee);
  const outilsNonSoldes = ouvrier.outilsPersonnels.filter((o) => !o.solde);
  const totalAvancesEnCours = avancesNonReglees.reduce(
    (s, a) => s + Number(a.montant),
    0
  );
  const totalOutilsRestant = outilsNonSoldes.reduce(
    (s, o) => s + Number(o.restantDu),
    0
  );

  return (
    <div>
      <PageHeader
        title={fullName}
        backHref="/ouvriers"
        action={
          <div className="flex items-center gap-2">
            <Link href={`/paie/nouveau?ouvrierId=${id}`}>
              <Button size="sm">
                <Banknote size={14} />
                <span className="hidden sm:inline">Générer paiement</span>
              </Button>
            </Link>
            <form action={deleteAction}>
              <Button type="submit" variant="danger" size="sm">
                <Trash2 size={14} />
              </Button>
            </form>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Informations</CardTitle>
            </CardHeader>
            <CardBody>
              <OuvrierForm
                ouvrier={{
                  nom: ouvrier.nom,
                  prenom: ouvrier.prenom,
                  telephone: ouvrier.telephone,
                  photo: ouvrier.photo,
                  typeContrat: ouvrier.typeContrat,
                  tarifBase: String(ouvrier.tarifBase),
                  modePaie: ouvrier.modePaie,
                  actif: ouvrier.actif,
                  equipeId: ouvrier.equipeId,
                  notes: ouvrier.notes,
                }}
                equipes={equipes}
                action={updateAction}
                submitLabel="Enregistrer"
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Pointages récents (60 derniers jours)</CardTitle>
              <Link href={`/pointage?date=${today}`}>
                <Button size="sm" variant="outline">
                  <Calendar size={14} /> Saisir aujourd&apos;hui
                </Button>
              </Link>
            </CardHeader>
            <CardBody>
              <PointageHistory
                pointages={pointages.map((p) => ({
                  id: p.id,
                  date: p.date,
                  joursTravailles: Number(p.joursTravailles),
                  chantierId: p.chantierId,
                  chantierNom: p.chantier?.nom ?? null,
                  note: p.note,
                }))}
                chantiers={chantiers}
                onUpdate={updatePointage}
                onDelete={deletePointage}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Avances en cours</CardTitle>
            </CardHeader>
            <CardBody>
              {avancesNonReglees.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-500 mb-4">
                  Aucune avance non réglée. Toute avance saisie sera déduite du prochain paiement.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800 mb-4">
                  {avancesNonReglees.map((a) => {
                    const remove = deleteAvance.bind(null, a.id, id);
                    return (
                      <li key={a.id} className="py-2 flex items-center gap-3 text-sm">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{formatEuro(a.montant.toString())}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-500">
                            {formatDate(a.date)} ·{" "}
                            <Badge color={a.mode === "ESPECES" ? "yellow" : "blue"}>
                              {a.mode === "ESPECES" ? "Espèces" : "Virement"}
                            </Badge>
                            {a.note && <span className="ml-2 italic">{a.note}</span>}
                          </div>
                        </div>
                        <form action={remove}>
                          <button
                            type="submit"
                            className="text-slate-400 dark:text-slate-500 hover:text-red-600 p-1"
                          >
                            <Trash2 size={14} />
                          </button>
                        </form>
                      </li>
                    );
                  })}
                </ul>
              )}

              <ResettingForm
                action={addAvanceAction}
                successMessage="Avance enregistrée"
                className="grid grid-cols-1 sm:grid-cols-12 gap-2"
              >
                <div className="sm:col-span-3">
                  <Input name="montant" type="number" step="0.01" min="0.01" placeholder="Montant" required />
                </div>
                <div className="sm:col-span-3">
                  <Input name="date" type="date" defaultValue={today} required />
                </div>
                <div className="sm:col-span-3">
                  <Select name="mode" defaultValue="ESPECES">
                    <option value="ESPECES">Espèces</option>
                    <option value="VIREMENT">Virement</option>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Input name="note" placeholder="Note" />
                </div>
                <div className="sm:col-span-1">
                  <Button type="submit" className="w-full">
                    <Plus size={14} />
                  </Button>
                </div>
              </ResettingForm>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Outils personnels (achetés pour l&apos;ouvrier)</CardTitle>
            </CardHeader>
            <CardBody>
              {outilsNonSoldes.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-500 mb-4">
                  Aucun outil personnel en cours. Si tu achètes un outil pour l&apos;ouvrier qu&apos;il
                  remboursera par retenue sur paie, ajoute-le ici.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800 mb-4">
                  {outilsNonSoldes.map((o) => {
                    const remove = deleteOutilPersonnel.bind(null, o.id, id);
                    const progression = Math.round(
                      ((Number(o.prixTotal) - Number(o.restantDu)) / Number(o.prixTotal)) * 100
                    );
                    return (
                      <li key={o.id} className="py-3">
                        <div className="flex items-center gap-3 text-sm">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-slate-900 dark:text-slate-100">{o.nom}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
                              Acheté {formatDate(o.dateAchat)} · {formatEuro(o.prixTotal.toString())}{" "}
                              · {formatEuro(o.mensualite.toString())}/mois
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium">
                              Reste {formatEuro(o.restantDu.toString())}
                            </div>
                            <div className="text-xs text-slate-400 dark:text-slate-500">{progression}% remboursé</div>
                          </div>
                          <form action={remove}>
                            <button
                              type="submit"
                              className="text-slate-400 dark:text-slate-500 hover:text-red-600 p-1"
                              title="Supprimer (uniquement si aucune retenue)"
                            >
                              <Trash2 size={14} />
                            </button>
                          </form>
                        </div>
                        <div className="mt-2 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500"
                            style={{ width: `${progression}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <ResettingForm
                action={addOutilAction}
                successMessage="Outil enregistré"
                className="grid grid-cols-1 sm:grid-cols-12 gap-2"
              >
                <div className="sm:col-span-4">
                  <Input name="nom" placeholder="Nom (Scie sauteuse...)" required />
                </div>
                <div className="sm:col-span-2">
                  <Input name="prixTotal" type="number" step="0.01" min="0.01" placeholder="Prix" required />
                </div>
                <div className="sm:col-span-2">
                  <Input name="mensualite" type="number" step="0.01" min="0.01" placeholder="Mensualité" required />
                </div>
                <div className="sm:col-span-3">
                  <Input name="dateAchat" type="date" defaultValue={today} required />
                </div>
                <div className="sm:col-span-1">
                  <Button type="submit" className="w-full">
                    <Plus size={14} />
                  </Button>
                </div>
              </ResettingForm>
            </CardBody>
          </Card>

          {ouvrier.paiements.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Derniers paiements</CardTitle>
              </CardHeader>
              <CardBody className="!p-0">
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {ouvrier.paiements.map((p) => (
                    <li key={p.id} className="px-5 py-3 flex items-center gap-3 text-sm">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">
                          Du {formatDate(p.periodeDebut)} au {formatDate(p.periodeFin)}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-500">
                          {Number(p.joursTravailles)} j ·{" "}
                          {p.statut === "PAYE" ? (
                            <Badge color="green">Payé</Badge>
                          ) : (
                            <Badge color="yellow">Calculé</Badge>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{formatEuro(p.montantNet.toString())}</div>
                        <div className="text-xs text-slate-400 dark:text-slate-500">net</div>
                      </div>
                      <Link href={`/paie/${p.id}`} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-500">
                        <ChevronRight size={16} />
                      </Link>
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
              <CardTitle>Calendrier de pointage</CardTitle>
            </CardHeader>
            <CardBody>
              <PointageCalendar
                key={`cal-${id}`}
                ouvrierId={id}
                chantiers={chantiers}
                initialPointages={calendarInitial}
                defaultChantierId={ouvrier.equipe?.chantierId ?? null}
                year={calYear}
                monthIdx={calMonthIdx}
                basePath={`/ouvriers/${id}`}
                action={savePointageBatch}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Récap des 6 derniers mois</CardTitle>
            </CardHeader>
            <CardBody>
              <MonthlyRecap
                pointages={pointagesRecap.map((p) => ({
                  date: p.date,
                  joursTravailles: Number(p.joursTravailles),
                }))}
                typeContrat={ouvrier.typeContrat}
                tarifBase={Number(ouvrier.tarifBase)}
              />
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-3 italic">
                Brut estimé selon le tarif actuel. Les paiements réels (avances, retenues
                outils, etc.) sont dans la liste des paiements ci-dessous.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Synthèse</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-500">Avances en cours</span>
                <span className="font-medium">{formatEuro(totalAvancesEnCours)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-500">Restant dû outils</span>
                <span className="font-medium">{formatEuro(totalOutilsRestant)}</span>
              </div>
              <div className="pt-2 border-t border-slate-100 flex justify-between">
                <span className="text-slate-700 dark:text-slate-300 font-medium">Total à déduire</span>
                <span className="font-semibold">
                  {formatEuro(totalAvancesEnCours + totalOutilsRestant)}
                </span>
              </div>
              <div className="text-xs text-slate-400 dark:text-slate-500 pt-2 border-t border-slate-100 flex items-center gap-1">
                <Wrench size={12} /> Sera appliqué à la prochaine génération de paiement
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
