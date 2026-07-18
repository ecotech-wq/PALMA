"use client";

// ─── Création d'une procédure ────────────────────────────────────────────────
// Feuille bas d'écran (pattern du dépôt) : nom, couleur d'accent (palette
// nommée, un seul endroit : lib/pipelines.ts) et modèle de départ (vierge
// ou l'une des 4 suggestions historiques). Les étapes arrivent PRÉ-REMPLIES
// du modèle choisi ; la création enchaîne sur la page de détail où elles
// se modifient librement (ajouter, renommer, réordonner, supprimer).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/Toast";
import { usePanneauOpaque } from "@/lib/usePanneauOpaque";
import {
  COULEURS_PIPELINE,
  MODELES_PAR_DEFAUT,
  PALETTE_PIPELINE,
  type CouleurPipeline,
} from "@/lib/pipelines";
import { creerPipeline } from "./actions";

const inputCls =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

export function NouvelleProcedure() {
  const [ouvert, setOuvert] = useState(false);
  const [couleur, setCouleur] = useState<CouleurPipeline>("ardoise");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const fondOpaque = usePanneauOpaque();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const modeleCle = String(fd.get("modeleCle") ?? "");
    startTransition(async () => {
      try {
        const { id } = await creerPipeline({
          libelle: String(fd.get("libelle") ?? ""),
          couleur,
          ...(modeleCle ? { modeleCle } : {}),
        });
        toast.success("Procédure créée : ajustez ses étapes");
        setOuvert(false);
        router.push(`/affaires/procedures/${id}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur");
      }
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOuvert(true)}>
        <Plus size={15} />
        Nouvelle procédure
      </Button>

      {ouvert && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 sm:items-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOuvert(false);
          }}
        >
          <div
            style={fondOpaque}
            className="max-h-[88dvh] w-full overflow-y-auto rounded-t-2xl border border-slate-200 p-4 shadow-xl dark:border-slate-700 sm:max-w-md sm:rounded-2xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Nouvelle procédure
              </h2>
              <button
                type="button"
                onClick={() => setOuvert(false)}
                aria-label="Fermer"
                className="flex h-11 w-11 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Nom de la procédure
                </span>
                <input
                  name="libelle"
                  required
                  maxLength={60}
                  placeholder="Maîtrise d'œuvre, Expertise, SAV..."
                  className={inputCls}
                />
              </label>

              <fieldset>
                <legend className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Couleur d&apos;accent
                </legend>
                <div className="flex flex-wrap gap-1">
                  {COULEURS_PIPELINE.map((c) => {
                    const accent = PALETTE_PIPELINE[c];
                    const choisi = couleur === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCouleur(c)}
                        aria-label={`Couleur ${accent.libelle}`}
                        aria-pressed={choisi}
                        title={accent.libelle}
                        className={`flex h-11 w-11 items-center justify-center rounded-md transition ${
                          choisi
                            ? "bg-slate-100 ring-2 ring-slate-400 dark:bg-slate-800"
                            : "hover:bg-slate-100 dark:hover:bg-slate-800"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`h-5 w-5 rounded-full ${accent.pastille}`}
                        />
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Étapes de départ
                </span>
                <select name="modeleCle" defaultValue="" className={inputCls}>
                  <option value="">
                    Tronc minimal (contact, devis, accord)
                  </option>
                  {MODELES_PAR_DEFAUT.map((m) => (
                    <option key={m.cle} value={m.cle}>
                      Copier « {m.libelle} » ({m.etapes.length} étapes)
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                  Les étapes et la checklist type restent modifiables juste
                  après, sur la fiche de la procédure.
                </span>
              </label>

              <Button type="submit" disabled={pending} className="w-full">
                {pending ? "Création..." : "Créer la procédure"}
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
