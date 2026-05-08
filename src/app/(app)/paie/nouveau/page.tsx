import Link from "next/link";
import { db } from "@/lib/db";
import { Card, CardBody } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Input, Field, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { generatePaiement } from "../actions";
import { calcPaie } from "@/lib/calc-paie";
import { formatEuro, formatDate, cn } from "@/lib/utils";

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Renvoie la liste des plages prédéfinies (presets) pour le formulaire */
function buildPresets() {
  const today = new Date();
  const dow = today.getDay(); // 0 = dim
  const offsetMon = dow === 0 ? 6 : dow - 1;

  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - offsetMon);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  const last7Start = new Date(today);
  last7Start.setDate(today.getDate() - 6);

  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const startPrevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const endPrevMonth = new Date(today.getFullYear(), today.getMonth(), 0);

  return [
    { key: "today", label: "Aujourd'hui", debut: iso(today), fin: iso(today) },
    {
      key: "yesterday",
      label: "Hier",
      debut: iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)),
      fin: iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)),
    },
    {
      key: "this_week",
      label: "Cette semaine",
      debut: iso(startOfWeek),
      fin: iso(endOfWeek),
    },
    { key: "last_7", label: "7 derniers jours", debut: iso(last7Start), fin: iso(today) },
    {
      key: "this_month",
      label: "Mois en cours",
      debut: iso(startOfMonth),
      fin: iso(endOfMonth),
    },
    {
      key: "prev_month",
      label: "Mois dernier",
      debut: iso(startPrevMonth),
      fin: iso(endPrevMonth),
    },
  ];
}

export default async function NouveauPaiementPage({
  searchParams,
}: {
  searchParams: Promise<{ ouvrierId?: string; periodeDebut?: string; periodeFin?: string }>;
}) {
  const sp = await searchParams;
  const ouvriers = await db.ouvrier.findMany({
    where: { actif: true },
    select: { id: true, nom: true, prenom: true, typeContrat: true, tarifBase: true },
    orderBy: { nom: "asc" },
  });

  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const periodeDebut = sp.periodeDebut ?? firstOfMonth.toISOString().slice(0, 10);
  const periodeFin = sp.periodeFin ?? lastOfMonth.toISOString().slice(0, 10);
  const presets = buildPresets();

  // Aperçu si ouvrier sélectionné
  let preview: {
    ouvrierNom: string;
    typeContrat: string;
    joursTravailles: number;
    montantBrut: number;
    avancesDeduites: number;
    avancesCount: number;
    retenueOutil: number;
    montantNet: number;
  } | null = null;

  if (sp.ouvrierId) {
    const o = await db.ouvrier.findUnique({
      where: { id: sp.ouvrierId },
      include: {
        pointages: {
          where: { date: { gte: new Date(periodeDebut), lte: new Date(periodeFin) } },
        },
        avances: { where: { reglee: false }, orderBy: { date: "asc" } },
        outilsPersonnels: { where: { solde: false } },
      },
    });
    if (o) {
      const joursTravailles = o.pointages.reduce((s, p) => s + Number(p.joursTravailles), 0);
      const calc = calcPaie({
        typeContrat: o.typeContrat,
        tarifBase: Number(o.tarifBase),
        joursTravailles,
        avances: o.avances.map((a) => ({ id: a.id, montant: Number(a.montant) })),
        outilsPersonnels: o.outilsPersonnels.map((p) => ({
          id: p.id,
          mensualite: Number(p.mensualite),
          restantDu: Number(p.restantDu),
        })),
      });
      preview = {
        ouvrierNom: [o.prenom, o.nom].filter(Boolean).join(" "),
        typeContrat: o.typeContrat,
        joursTravailles,
        montantBrut: calc.montantBrut,
        avancesDeduites: calc.avancesDeduites,
        avancesCount: o.avances.length,
        retenueOutil: calc.retenueOutil,
        montantNet: calc.montantNet,
      };
    }
  }

  return (
    <div>
      <PageHeader
        title="Nouveau paiement"
        description="Sélectionne l'ouvrier et la période, l'app calcule automatiquement"
        backHref="/paie"
      />

      <Card className="mb-5">
        <CardBody>
          {/* Presets rapides pour la période */}
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-500 dark:text-slate-400 mr-1">
              Plage rapide :
            </span>
            {presets.map((p) => {
              const params = new URLSearchParams();
              if (sp.ouvrierId) params.set("ouvrierId", sp.ouvrierId);
              params.set("periodeDebut", p.debut);
              params.set("periodeFin", p.fin);
              const isActive = p.debut === periodeDebut && p.fin === periodeFin;
              return (
                <Link
                  key={p.key}
                  href={`/paie/nouveau?${params.toString()}`}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-md border transition",
                    isActive
                      ? "bg-brand-100 dark:bg-brand-900/40 border-brand-300 dark:border-brand-700 text-brand-700 dark:text-brand-300 font-medium"
                      : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                  )}
                >
                  {p.label}
                </Link>
              );
            })}
          </div>

          <form className="grid grid-cols-1 sm:grid-cols-12 gap-3" method="get">
            <div className="sm:col-span-5">
              <Field label="Ouvrier" required>
                <Select name="ouvrierId" defaultValue={sp.ouvrierId ?? ""} required>
                  <option value="" disabled>Choisir un ouvrier…</option>
                  {ouvriers.map((o) => (
                    <option key={o.id} value={o.id}>
                      {[o.prenom, o.nom].filter(Boolean).join(" ")}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="sm:col-span-3">
              <Field label="Du" required>
                <Input name="periodeDebut" type="date" defaultValue={periodeDebut} required />
              </Field>
            </div>
            <div className="sm:col-span-3">
              <Field label="Au" required>
                <Input name="periodeFin" type="date" defaultValue={periodeFin} required />
              </Field>
            </div>
            <div className="sm:col-span-1 flex items-end">
              <Button type="submit" className="w-full" variant="secondary">
                Calculer
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {preview && (
        <Card>
          <CardBody>
            <div className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{preview.ouvrierNom}</h2>
                <p className="text-sm text-slate-500 dark:text-slate-500">
                  Période du {formatDate(periodeDebut)} au {formatDate(periodeFin)} —{" "}
                  {preview.joursTravailles} jour{preview.joursTravailles > 1 ? "s" : ""} pointé
                  {preview.joursTravailles > 1 ? "s" : ""}
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-500">Brut</div>
                  <div className="text-lg font-semibold">{formatEuro(preview.montantBrut)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-500">
                    Avances ({preview.avancesCount})
                  </div>
                  <div className="text-lg font-semibold text-orange-600">
                    -{formatEuro(preview.avancesDeduites)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-500">Retenue outil</div>
                  <div className="text-lg font-semibold text-orange-600">
                    -{formatEuro(preview.retenueOutil)}
                  </div>
                </div>
                <div className="border-l border-slate-200 dark:border-slate-800 pl-3">
                  <div className="text-xs text-slate-500 dark:text-slate-500">Net à payer</div>
                  <div
                    className={`text-2xl font-bold ${
                      preview.montantNet < 0 ? "text-red-600" : "text-slate-900 dark:text-slate-100"
                    }`}
                  >
                    {formatEuro(preview.montantNet)}
                  </div>
                </div>
              </div>

              {preview.montantNet < 0 && (
                <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                  ⚠ Le net est négatif : avances + retenues dépassent le brut. Ajuste les avances
                  ou la période.
                </div>
              )}

              {preview.joursTravailles === 0 && preview.typeContrat !== "FORFAIT" && (
                <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                  Aucun jour pointé sur cette période. Vérifie le pointage avant de générer.
                </div>
              )}

              <form action={generatePaiement} className="flex flex-col sm:flex-row sm:items-end gap-3 pt-3 border-t border-slate-100">
                <input type="hidden" name="ouvrierId" value={sp.ouvrierId} />
                <input type="hidden" name="periodeDebut" value={periodeDebut} />
                <input type="hidden" name="periodeFin" value={periodeFin} />
                <div className="sm:flex-1">
                  <Field label="Mode de paiement">
                    <Select name="mode" defaultValue="ESPECES">
                      <option value="ESPECES">Espèces</option>
                      <option value="VIREMENT">Virement</option>
                    </Select>
                  </Field>
                </div>
                <Button type="submit" size="lg">
                  Valider et enregistrer
                </Button>
              </form>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
