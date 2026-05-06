"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { Check, User, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/utils";

type Ouvrier = {
  id: string;
  nom: string;
  prenom: string | null;
  photo: string | null;
  typeContrat: string;
  equipe: { id: string; nom: string; chantier: { nom: string } | null } | null;
  pointageJours: number;
};

const options = [
  { value: 0, label: "Absent", color: "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-500" },
  { value: 0.5, label: "½ j.", color: "bg-yellow-100 text-yellow-800 ring-yellow-300" },
  { value: 1, label: "1 j.", color: "bg-green-100 text-green-800 ring-green-300" },
];

const contratLabel: Record<string, string> = {
  FIXE: "Fixe",
  JOUR: "Journalier",
  SEMAINE: "Hebdo",
  MOIS: "Au mois",
  FORFAIT: "Forfait",
};

export function PointageGrid({
  ouvriers,
  date,
  action,
}: {
  ouvriers: Ouvrier[];
  date: string;
  action: (date: string, formData: FormData) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, number>>(
    Object.fromEntries(ouvriers.map((o) => [o.id, o.pointageJours]))
  );
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toastApi = useToast();

  // Group by équipe
  const byEquipe = new Map<string, { equipeNom: string; chantierNom: string | null; ouvriers: Ouvrier[] }>();
  const sansEquipe: Ouvrier[] = [];
  for (const o of ouvriers) {
    if (o.equipe) {
      const key = o.equipe.id;
      if (!byEquipe.has(key)) {
        byEquipe.set(key, {
          equipeNom: o.equipe.nom,
          chantierNom: o.equipe.chantier?.nom ?? null,
          ouvriers: [],
        });
      }
      byEquipe.get(key)!.ouvriers.push(o);
    } else {
      sansEquipe.push(o);
    }
  }

  function setVal(id: string, v: number) {
    setValues((prev) => ({ ...prev, [id]: v }));
    setSaved(false);
  }

  function setEquipe(equipeOuvriers: Ouvrier[], v: number) {
    setValues((prev) => {
      const next = { ...prev };
      equipeOuvriers.forEach((o) => (next[o.id] = v));
      return next;
    });
    setSaved(false);
  }

  function onSubmit() {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    for (const [id, v] of Object.entries(values)) {
      fd.set(`jours_${id}`, String(v));
    }
    startTransition(async () => {
      try {
        await action(date, fd);
        setSaved(true);
        toastApi.success("Pointage enregistré");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erreur lors de l'enregistrement";
        setError(msg);
        toastApi.error(msg);
      }
    });
  }

  const total = Object.values(values).reduce((s, v) => s + v, 0);

  return (
    <div className="space-y-4 pb-24">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {Array.from(byEquipe.entries()).map(([equipeId, group]) => (
        <EquipeSection
          key={equipeId}
          equipeNom={group.equipeNom}
          chantierNom={group.chantierNom}
          ouvriers={group.ouvriers}
          values={values}
          onVal={setVal}
          onAll={(v) => setEquipe(group.ouvriers, v)}
        />
      ))}

      {sansEquipe.length > 0 && (
        <EquipeSection
          equipeNom="Sans équipe"
          chantierNom={null}
          ouvriers={sansEquipe}
          values={values}
          onVal={setVal}
          onAll={(v) => setEquipe(sansEquipe, v)}
        />
      )}

      <div className="fixed bottom-16 md:bottom-4 inset-x-0 z-20 px-4">
        <div className="max-w-3xl mx-auto bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg px-4 py-3 flex items-center gap-3">
          <div className="text-sm">
            <div className="text-slate-500 dark:text-slate-500">Total</div>
            <div className="font-semibold text-slate-900 dark:text-slate-100">
              {total} jour{total > 1 ? "s" : ""}-homme
            </div>
          </div>
          <div className="flex-1" />
          {saved && (
            <span className="text-sm text-green-600 flex items-center gap-1">
              <Check size={14} /> Enregistré
            </span>
          )}
          <Button onClick={onSubmit} disabled={pending} size="lg">
            {pending ? "..." : (
              <>
                <span className="hidden sm:inline">Enregistrer le pointage</span>
                <span className="sm:hidden">Enregistrer</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function EquipeSection({
  equipeNom,
  chantierNom,
  ouvriers,
  values,
  onVal,
  onAll,
}: {
  equipeNom: string;
  chantierNom: string | null;
  ouvriers: Ouvrier[];
  values: Record<string, number>;
  onVal: (id: string, v: number) => void;
  onAll: (v: number) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        className="w-full flex items-center gap-3 p-3 sm:p-4 hover:bg-slate-50 dark:hover:bg-slate-900"
      >
        <div className="flex-1 text-left">
          <div className="font-semibold text-slate-900 dark:text-slate-100">{equipeNom}</div>
          {chantierNom && <div className="text-xs text-slate-500 dark:text-slate-500">Chantier : {chantierNom}</div>}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-500">
          {ouvriers.length} ouvrier{ouvriers.length > 1 ? "s" : ""}
        </div>
        {open ? <ChevronUp size={16} className="text-slate-400 dark:text-slate-500" /> : <ChevronDown size={16} className="text-slate-400 dark:text-slate-500" />}
      </button>

      {open && (
        <>
          <div className="px-3 sm:px-4 pb-2 flex gap-2 border-b border-slate-100">
            <span className="text-xs text-slate-500 dark:text-slate-500 self-center mr-1">Tous :</span>
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => onAll(o.value)}
                className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-500"
              >
                {o.label}
              </button>
            ))}
          </div>

          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {ouvriers.map((o) => {
              const val = values[o.id] ?? 0;
              const fullName = [o.prenom, o.nom].filter(Boolean).join(" ");
              return (
                <li key={o.id} className="p-3 flex items-center gap-3">
                  <div className="w-9 h-9 shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden relative">
                    {o.photo ? (
                      <Image src={o.photo} alt={fullName} fill sizes="36px" className="object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-slate-400 dark:text-slate-500">
                        <User size={16} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900 dark:text-slate-100 truncate text-sm">{fullName}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-500">{contratLabel[o.typeContrat]}</div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {options.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => onVal(o.id, opt.value)}
                        className={cn(
                          "min-w-[3rem] h-10 rounded-md text-sm font-medium transition border",
                          val === opt.value
                            ? `${opt.color} ring-2 border-transparent`
                            : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
