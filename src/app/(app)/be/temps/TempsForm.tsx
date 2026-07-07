"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Field, Textarea, Select } from "@/components/ui/Input";
import { saisirTemps } from "../actions";

type PhaseOption = { id: string; code: string; libelle: string };
type EtudeOption = { id: string; nom: string; phases: PhaseOption[] };

// ─── Saisie « ma journée » : pensée téléphone d'abord ───────────────────────
// Deux clics au stand-up : l'étude, les heures, envoyer. La date est la
// veille par défaut (on saisit le réalisé d'hier), la phase est facultative.

export function TempsForm({
  etudes,
  etudeInitiale,
  dateInitiale,
}: {
  etudes: EtudeOption[];
  etudeInitiale?: string;
  dateInitiale: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [etudeId, setEtudeId] = useState(
    etudeInitiale && etudes.some((e) => e.id === etudeInitiale)
      ? etudeInitiale
      : etudes[0]?.id ?? ""
  );

  const phases = etudes.find((e) => e.id === etudeId)?.phases ?? [];

  function onSubmit(formData: FormData) {
    setError(null);
    setOk(false);
    startTransition(async () => {
      try {
        await saisirTemps(formData);
        setOk(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  return (
    <form action={onSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {ok && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Temps enregistré.
        </div>
      )}

      <Field label="Étude" required>
        <Select
          name="chantierId"
          value={etudeId}
          onChange={(e) => setEtudeId(e.target.value)}
          required
        >
          {etudes.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nom}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Phase (facultatif)">
        <Select name="phaseId" defaultValue="">
          <option value="">Hors phase / général</option>
          {phases.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} · {p.libelle}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" required>
          <Input type="date" name="date" defaultValue={dateInitiale} required />
        </Field>
        <Field label="Heures" required>
          <Input
            type="number"
            name="heures"
            step={0.25}
            min={0.25}
            max={14}
            inputMode="decimal"
            placeholder="3,5"
            required
          />
        </Field>
      </div>

      <Field label="Note (facultatif)">
        <Textarea
          name="note"
          rows={2}
          placeholder="Ce qui a été fait (descente de charges, plans de coffrage...)"
        />
      </Field>

      <Button type="submit" disabled={pending || etudes.length === 0} className="w-full sm:w-auto">
        {pending ? "Enregistrement..." : "Enregistrer mes heures"}
      </Button>
    </form>
  );
}
