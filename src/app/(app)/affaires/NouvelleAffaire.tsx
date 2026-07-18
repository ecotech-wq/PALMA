"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/Toast";
import { usePanneauOpaque } from "@/lib/usePanneauOpaque";
import { creerAffaire } from "./actions";

// ─── Création d'une affaire ──────────────────────────────────────────────────
// Feuille bas d'écran au téléphone (l'app vit sur mobile), panneau centré au
// desktop. Champs volontairement courts : une affaire naît d'un appel, le
// reste se complète sur la fiche. La procédure (pipeline) se choisit parmi
// les procédures ACTIVES de l'espace courant, éditables dans
// /affaires/procedures : les 4 typologies historiques n'en sont plus que
// les suggestions de départ.

const inputCls =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

export function NouvelleAffaire({
  procedures,
  procedureInitiale,
  responsables,
  compact = false,
  versCanal = false,
}: {
  /** Procédures ACTIVES de l'espace courant (vide : pas d'espace choisi). */
  procedures: { id: string; libelle: string }[];
  procedureInitiale?: string;
  responsables: { id: string; name: string }[];
  /** Feuille minimale (procédure + titre + contact) : utilisée par le hub
   *  messagerie, où une affaire naît d'un appel et se complète ensuite. */
  compact?: boolean;
  /** Après création, ouvrir le fil de l'affaire (messagerie) plutôt que
   *  la fiche : le hub messagerie enchaîne directement sur la discussion. */
  versCanal?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);

  return (
    <>
      <Button size="sm" onClick={() => setOuvert(true)}>
        <Plus size={15} />
        Nouvelle affaire
      </Button>
      {ouvert && (
        <NouvelleAffaireFeuille
          procedures={procedures}
          procedureInitiale={procedureInitiale}
          responsables={responsables}
          compact={compact}
          versCanal={versCanal}
          onClose={() => setOuvert(false)}
        />
      )}
    </>
  );
}

/** La feuille de création seule, pilotée de l'extérieur : utilisée par le
 *  bouton « + Nouveau » du hub messagerie (choix affaire / chantier) en
 *  plus du bouton dédié ci-dessus. */
export function NouvelleAffaireFeuille({
  procedures,
  procedureInitiale,
  responsables,
  compact = false,
  versCanal = false,
  onClose,
}: {
  procedures: { id: string; libelle: string }[];
  procedureInitiale?: string;
  responsables: { id: string; name: string }[];
  compact?: boolean;
  versCanal?: boolean;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const fondOpaque = usePanneauOpaque();
  const aucuneProcedure = procedures.length === 0;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const valeur = String(fd.get("valeurEstimee") ?? "").trim();
    startTransition(async () => {
      try {
        const { id } = await creerAffaire({
          pipelineId: String(fd.get("pipelineId") ?? ""),
          titre: String(fd.get("titre") ?? ""),
          contactNom: String(fd.get("contactNom") ?? ""),
          contactTel: String(fd.get("contactTel") ?? ""),
          contactEmail: String(fd.get("contactEmail") ?? ""),
          adresse: String(fd.get("adresse") ?? ""),
          valeurEstimee: valeur ? Number(valeur) : undefined,
          responsableId: String(fd.get("responsableId") ?? ""),
        });
        toast.success("Affaire créée");
        onClose();
        router.push(versCanal ? `/messagerie/affaire/${id}` : `/affaires/${id}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
          <div
            style={fondOpaque}
            className="max-h-[88dvh] w-full overflow-y-auto rounded-t-2xl border border-slate-200 p-4 shadow-xl dark:border-slate-700 sm:max-w-md sm:rounded-2xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Nouvelle affaire
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer"
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-3">
              {aucuneProcedure && (
                <p className="rounded-md border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  Choisissez d&apos;abord une entreprise dans le sélecteur
                  d&apos;espace : une affaire naît dans la procédure de son
                  entreprise.
                </p>
              )}
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Procédure
                </span>
                <select
                  name="pipelineId"
                  defaultValue={procedureInitiale ?? procedures[0]?.id ?? ""}
                  disabled={aucuneProcedure}
                  className={inputCls}
                >
                  {procedures.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.libelle}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Titre de l&apos;affaire
                </span>
                <input
                  name="titre"
                  required
                  placeholder="Maison R+1 à Saint-Denis"
                  className={inputCls}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Contact
                  </span>
                  <input
                    name="contactNom"
                    required
                    placeholder="Nom du contact"
                    className={inputCls}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Téléphone
                  </span>
                  <input
                    name="contactTel"
                    type="tel"
                    inputMode="tel"
                    placeholder="0692..."
                    className={inputCls}
                  />
                </label>
              </div>
              {/* Mode compact (hub messagerie) : l'essentiel seulement,
                  le reste se complète sur la fiche. */}
              {!compact && (
                <>
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Courriel (facultatif)
                    </span>
                    <input
                      name="contactEmail"
                      type="email"
                      placeholder="contact@exemple.re"
                      className={inputCls}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      Adresse du projet (facultatif)
                    </span>
                    <input name="adresse" className={inputCls} />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-sm">
                      <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                        Valeur estimée (EUR)
                      </span>
                      <input
                        name="valeurEstimee"
                        type="number"
                        min="0"
                        step="100"
                        inputMode="numeric"
                        className={`${inputCls} font-mono`}
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                        Responsable
                      </span>
                      <select name="responsableId" defaultValue="" className={inputCls}>
                        <option value="">Personne</option>
                        {responsables.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </>
              )}
              <Button
                type="submit"
                disabled={pending || aucuneProcedure}
                className="w-full"
              >
                {pending ? "Création..." : "Créer l'affaire"}
              </Button>
            </form>
          </div>
    </div>
  );
}
