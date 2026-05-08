"use client";

import { useState } from "react";
import { CalendarRange, Save } from "lucide-react";
import { ResettingForm } from "@/components/ResettingForm";
import { Field, Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

type Chantier = { id: string; nom: string };

/**
 * Saisie multiple : applique le même pointage sur plusieurs jours d'affilée
 * pour un seul ouvrier. Pratique pour rattraper une semaine ou un mois entier
 * (forfait, ouvrier au mois, etc.) sans cocher 22 cases une par une.
 *
 * Par sécurité, les jours déjà pointés sont sautés sauf si on coche
 * "Écraser les pointages existants".
 */
export function MultiPointageForm({
  ouvrierId,
  chantiers,
  defaultChantierId,
  action,
}: {
  ouvrierId: string;
  chantiers: Chantier[];
  defaultChantierId: string | null;
  action: (formData: FormData) => Promise<void>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  // Lundi dernier comme date début par défaut (rattrapage de la semaine)
  const defaultDebut = (() => {
    const d = new Date();
    const day = d.getDay(); // 0 = dimanche
    const diff = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - diff);
    return d.toISOString().slice(0, 10);
  })();

  const [dateDebut, setDateDebut] = useState(defaultDebut);
  const [dateFin, setDateFin] = useState(today);
  const [inclureWeekend, setInclureWeekend] = useState(false);

  // Aperçu du nombre de jours
  const nbJours = (() => {
    if (!dateDebut || !dateFin) return 0;
    const debut = new Date(dateDebut + "T00:00:00.000Z");
    const fin = new Date(dateFin + "T00:00:00.000Z");
    if (isNaN(debut.getTime()) || isNaN(fin.getTime()) || fin < debut) return 0;
    let count = 0;
    const cursor = new Date(debut);
    while (cursor <= fin) {
      const dow = cursor.getUTCDay();
      const isWeekend = dow === 0 || dow === 6;
      if (inclureWeekend || !isWeekend) count++;
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return count;
  })();

  return (
    <ResettingForm
      action={action}
      successMessage="Pointages enregistrés"
      className="space-y-3"
    >
      <input type="hidden" name="ouvrierId" value={ouvrierId} />

      <div className="grid grid-cols-2 gap-2">
        <Field label="Du" required>
          <Input
            name="dateDebut"
            type="date"
            value={dateDebut}
            onChange={(e) => setDateDebut(e.target.value)}
            required
          />
        </Field>
        <Field label="Au" required>
          <Input
            name="dateFin"
            type="date"
            value={dateFin}
            onChange={(e) => setDateFin(e.target.value)}
            required
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Jours / jour" required>
          <Select name="joursParJour" defaultValue="1">
            <option value="0.5">½ journée</option>
            <option value="1">1 journée</option>
          </Select>
        </Field>
        <Field label="Chantier (optionnel)">
          <Select name="chantierId" defaultValue={defaultChantierId ?? ""}>
            <option value="">— Équipe en cours —</option>
            {chantiers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Note (optionnelle, appliquée sur tous les jours)">
        <Input name="note" placeholder="Ex. : congés, pose carrelage, etc." />
      </Field>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            name="inclureWeekend"
            checked={inclureWeekend}
            onChange={(e) => setInclureWeekend(e.target.checked)}
            className="rounded border-slate-300 dark:border-slate-700 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-slate-700 dark:text-slate-300">
            Inclure les week-ends
          </span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            name="ecraserExistants"
            className="rounded border-slate-300 dark:border-slate-700 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-slate-700 dark:text-slate-300">
            Écraser les pointages existants
          </span>
        </label>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
        <div className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
          <CalendarRange size={13} />
          {nbJours > 0 ? (
            <span>
              <strong className="text-slate-900 dark:text-slate-100">
                {nbJours}
              </strong>{" "}
              jour{nbJours > 1 ? "s" : ""} à enregistrer
            </span>
          ) : (
            <span className="italic text-slate-400">
              Choisis une plage de dates valide
            </span>
          )}
        </div>
        <Button type="submit" size="sm" disabled={nbJours === 0}>
          <Save size={14} />
          Enregistrer la plage
        </Button>
      </div>
    </ResettingForm>
  );
}
