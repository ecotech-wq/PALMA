import { redirect } from "next/navigation";
import { Settings, Save } from "lucide-react";
import { auth } from "@/auth";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Field, Input, Select } from "@/components/ui/Input";
import { ResettingForm } from "@/components/ResettingForm";
import { getAppSettings } from "@/lib/app-settings";
import { updateAppSettings } from "./actions";

export default async function ParametresPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const settings = await getAppSettings();

  return (
    <div>
      <PageHeader
        title="Paramètres"
        description="Configuration de l'application"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings size={18} />
                Paramètres généraux
              </CardTitle>
            </CardHeader>
            <CardBody>
              <ResettingForm
                action={updateAppSettings}
                successMessage="Paramètres mis à jour"
                className="space-y-4"
              >
                <Field
                  label="Nom de l'entreprise"
                  hint="Apparaît sur les exports et rapports"
                >
                  <Input
                    name="nomEntreprise"
                    defaultValue={settings.nomEntreprise ?? ""}
                    placeholder="Autonhome"
                  />
                </Field>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field
                    label="Jours / mois (base de calcul)"
                    required
                    hint="Pour les contrats FIXE et MOIS : brut = salaire × jours pointés / cette base"
                  >
                    <Input
                      type="number"
                      name="joursParMois"
                      min="20"
                      max="31"
                      defaultValue={settings.joursParMois}
                      required
                    />
                  </Field>
                  <Field
                    label="Jours / semaine (base de calcul)"
                    required
                    hint="Pour les contrats SEMAINE : brut = salaire × jours pointés / cette base"
                  >
                    <Input
                      type="number"
                      name="joursParSemaine"
                      min="5"
                      max="7"
                      defaultValue={settings.joursParSemaine}
                      required
                    />
                  </Field>
                </div>

                <Field
                  label="Mode de règlement par défaut"
                  required
                  hint="Pré-sélectionné dans les nouveaux paiements"
                >
                  <Select
                    name="modePaieDefault"
                    defaultValue={settings.modePaieDefault}
                  >
                    <option value="ESPECES">Espèces</option>
                    <option value="VIREMENT">Virement</option>
                  </Select>
                </Field>

                <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
                  <Button type="submit">
                    <Save size={14} />
                    Enregistrer
                  </Button>
                </div>
              </ResettingForm>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>À savoir</CardTitle>
            </CardHeader>
            <CardBody className="text-sm text-slate-600 dark:text-slate-400 space-y-3">
              <div>
                <strong className="text-slate-900 dark:text-slate-100 block mb-0.5">
                  Bases de calcul
                </strong>
                Les paiements existants ne sont pas recalculés
                automatiquement quand tu modifies ces bases. Seuls les
                nouveaux paiements générés en tiendront compte.
              </div>
              <div>
                <strong className="text-slate-900 dark:text-slate-100 block mb-0.5">
                  Convention française usuelle
                </strong>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>23 jours/mois (mois ouvré moyen, hors dimanches)</li>
                  <li>26 jours/mois (jours ouvrables, hors dimanches)</li>
                  <li>21,67 jours/mois (mensualisation légale)</li>
                  <li>6 jours/semaine (lundi au samedi)</li>
                </ul>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
