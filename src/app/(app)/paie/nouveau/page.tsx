import { db } from "@/lib/db";
import { Card, CardBody } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Input, Field, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { generatePaiement } from "../actions";
import { calcPaie } from "@/lib/calc-paie";
import { formatEuro, formatDate } from "@/lib/utils";

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
