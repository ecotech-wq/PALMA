"use client";

// ─── Éditeur d'une procédure (étapes + checklist modèle) ─────────────────────
// Tout se fait au doigt (cibles 44 px, feuilles bas d'écran, aucune action
// au survol seul). Chaque geste appelle sa server action gardée puis
// rafraîchit la route ; le réordonnancement applique le motif optimiste
// anti-flash du dépôt (ordre local immédiat, rollback + toast si échec).
// La suppression d'une étape encore occupée IMPOSE le choix d'une étape
// de destination : la feuille dédiée ne propose rien d'autre.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/Toast";
import { usePanneauOpaque } from "@/lib/usePanneauOpaque";
import {
  COULEURS_PIPELINE,
  PALETTE_PIPELINE,
  accentPipeline,
} from "@/lib/pipelines";
import {
  ajouterEtape,
  ajouterPieceModele,
  basculerActifPipeline,
  deplacerEtape,
  deplacerPieceModele,
  majPipeline,
  renommerEtape,
  renommerPieceModele,
  supprimerEtape,
  supprimerPieceModele,
  supprimerPipeline,
} from "../actions";

const inputCls =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

const boutonIconeCls =
  "flex h-11 w-11 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200";

type EtapeLigne = { cle: string; libelle: string; nbAffaires: number };
type PieceLigne = { cle: string; libelle: string };

function memesCles(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function EditionProcedure({
  procedure,
  etapes,
  pieces,
}: {
  procedure: {
    id: string;
    libelle: string;
    couleur: string;
    actif: boolean;
    nbEnCours: number;
    nbTotal: number;
  };
  etapes: EtapeLigne[];
  pieces: PieceLigne[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const fondOpaque = usePanneauOpaque();

  // Feuilles ouvertes (une seule à la fois, bas d'écran).
  const [renommage, setRenommage] = useState<
    | { type: "procedure"; valeur: string }
    | { type: "etape" | "piece"; cle: string; valeur: string }
    | null
  >(null);
  const [suppressionEtape, setSuppressionEtape] = useState<EtapeLigne | null>(
    null
  );

  // Overrides optimistes de l'ordre (anti-flash), effacés quand les props
  // rafraîchies les ont rattrapés.
  const [ordreEtapes, setOrdreEtapes] = useState<string[] | null>(null);
  const [ordrePieces, setOrdrePieces] = useState<string[] | null>(null);
  useEffect(() => {
    setOrdreEtapes((prev) =>
      prev && memesCles(prev, etapes.map((e) => e.cle)) ? null : prev
    );
  }, [etapes]);
  useEffect(() => {
    setOrdrePieces((prev) =>
      prev && memesCles(prev, pieces.map((p) => p.cle)) ? null : prev
    );
  }, [pieces]);

  const etapesParCle = new Map(etapes.map((e) => [e.cle, e]));
  const etapesAffichees = (ordreEtapes ?? etapes.map((e) => e.cle))
    .map((cle) => etapesParCle.get(cle))
    .filter((e): e is EtapeLigne => e !== undefined);
  const piecesParCle = new Map(pieces.map((p) => [p.cle, p]));
  const piecesAffichees = (ordrePieces ?? pieces.map((p) => p.cle))
    .map((cle) => piecesParCle.get(cle))
    .filter((p): p is PieceLigne => p !== undefined);

  function lancer(fn: () => Promise<unknown>, ok?: string, rollback?: () => void) {
    startTransition(async () => {
      try {
        await fn();
        if (ok) toast.success(ok);
        router.refresh();
      } catch (err) {
        rollback?.();
        toast.error(err instanceof Error ? err.message : "Erreur");
      }
    });
  }

  function deplacerLigne(
    quoi: "etape" | "piece",
    cle: string,
    sens: "monter" | "descendre"
  ) {
    const source =
      quoi === "etape"
        ? (ordreEtapes ?? etapes.map((e) => e.cle))
        : (ordrePieces ?? pieces.map((p) => p.cle));
    const ids = [...source];
    const i = ids.indexOf(cle);
    const j = sens === "monter" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    const poser = quoi === "etape" ? setOrdreEtapes : setOrdrePieces;
    poser(ids);
    lancer(
      () =>
        quoi === "etape"
          ? deplacerEtape(procedure.id, { cle, sens })
          : deplacerPieceModele(procedure.id, { cle, sens }),
      undefined,
      () => poser(null)
    );
  }

  const accent = accentPipeline(procedure.couleur);

  return (
    <div className="space-y-4">
      {/* ── Identité : nom, couleur, activation, suppression ─────────── */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`h-3 w-3 shrink-0 rounded-full ${accent.pastille}`}
          />
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {procedure.libelle}
          </h2>
          {!procedure.actif && (
            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              Inactive
            </span>
          )}
          <button
            type="button"
            onClick={() =>
              setRenommage({ type: "procedure", valeur: procedure.libelle })
            }
            aria-label="Renommer la procédure"
            className={boutonIconeCls}
          >
            <Pencil size={15} />
          </button>
        </div>

        {/* Couleur : la palette nommée, un tap par accent. */}
        <div className="mt-3 flex flex-wrap gap-1">
          {COULEURS_PIPELINE.map((c) => {
            const a = PALETTE_PIPELINE[c];
            const choisi = procedure.couleur === c;
            return (
              <button
                key={c}
                type="button"
                disabled={pending}
                onClick={() =>
                  !choisi &&
                  lancer(
                    () => majPipeline(procedure.id, { couleur: c }),
                    "Couleur mise à jour"
                  )
                }
                aria-label={`Couleur ${a.libelle}`}
                aria-pressed={choisi}
                title={a.libelle}
                className={`flex h-11 w-11 items-center justify-center rounded-md transition ${
                  choisi
                    ? "bg-slate-100 ring-2 ring-slate-400 dark:bg-slate-800"
                    : "hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`h-5 w-5 rounded-full ${a.pastille}`}
                />
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              lancer(
                () => basculerActifPipeline(procedure.id, !procedure.actif),
                procedure.actif ? "Procédure désactivée" : "Procédure réactivée"
              )
            }
          >
            {procedure.actif ? "Désactiver" : "Réactiver"}
          </Button>
          {procedure.nbTotal === 0 ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                if (
                  window.confirm(
                    `Supprimer la procédure « ${procedure.libelle} » ? ` +
                      "Cette action est définitive."
                  )
                ) {
                  startTransition(async () => {
                    try {
                      await supprimerPipeline(procedure.id);
                      toast.success("Procédure supprimée");
                      router.push("/affaires/procedures");
                    } catch (err) {
                      toast.error(
                        err instanceof Error ? err.message : "Erreur"
                      );
                    }
                  });
                }
              }}
            >
              <Trash2 size={14} />
              Supprimer
            </Button>
          ) : (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {procedure.nbTotal} affaire{procedure.nbTotal > 1 ? "s" : ""}{" "}
              rattachée{procedure.nbTotal > 1 ? "s" : ""} : suppression
              impossible, désactivez plutôt.
            </span>
          )}
        </div>
      </section>

      {/* ── Étapes du pipeline ────────────────────────────────────────── */}
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900 dark:border-slate-800 dark:text-slate-100">
          Étapes
          <span className="ml-2 text-xs font-normal text-slate-500">
            l&apos;ordre des colonnes du kanban
          </span>
        </h2>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {etapesAffichees.map((e, i) => (
            <li key={e.cle} className="flex items-center gap-1 py-1 pl-4 pr-2">
              <span className="w-5 shrink-0 text-right font-mono text-xs tabular-nums text-slate-400">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-slate-800 dark:text-slate-200">
                  {e.libelle}
                </span>
                {e.nbAffaires > 0 && (
                  <span className="block text-[11px] text-slate-500">
                    {e.nbAffaires} affaire{e.nbAffaires > 1 ? "s" : ""}
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => deplacerLigne("etape", e.cle, "monter")}
                disabled={i === 0 || pending}
                aria-label={`Monter ${e.libelle}`}
                className={boutonIconeCls}
              >
                <ChevronUp size={16} />
              </button>
              <button
                type="button"
                onClick={() => deplacerLigne("etape", e.cle, "descendre")}
                disabled={i === etapesAffichees.length - 1 || pending}
                aria-label={`Descendre ${e.libelle}`}
                className={boutonIconeCls}
              >
                <ChevronDown size={16} />
              </button>
              <button
                type="button"
                onClick={() =>
                  setRenommage({ type: "etape", cle: e.cle, valeur: e.libelle })
                }
                aria-label={`Renommer ${e.libelle}`}
                className={boutonIconeCls}
              >
                <Pencil size={15} />
              </button>
              <button
                type="button"
                disabled={pending || etapesAffichees.length <= 1}
                onClick={() => {
                  if (e.nbAffaires > 0) {
                    // Étape occupée : la feuille IMPOSE la destination.
                    setSuppressionEtape(e);
                  } else if (
                    window.confirm(`Supprimer l'étape « ${e.libelle} » ?`)
                  ) {
                    lancer(
                      () => supprimerEtape(procedure.id, { cle: e.cle }),
                      "Étape supprimée"
                    );
                  }
                }}
                aria-label={`Supprimer ${e.libelle}`}
                className={boutonIconeCls}
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
        {/* Ajout : libellé + position (à n'importe quel endroit). */}
        <form
          className="flex flex-col gap-2 border-t border-slate-100 p-3 dark:border-slate-800 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            const libelle = String(fd.get("libelle") ?? "").trim();
            const avantCle = String(fd.get("avantCle") ?? "");
            if (!libelle) return;
            lancer(
              () =>
                ajouterEtape(procedure.id, {
                  libelle,
                  ...(avantCle ? { avantCle } : {}),
                }),
              "Étape ajoutée"
            );
            form.reset();
          }}
        >
          <input
            name="libelle"
            maxLength={60}
            placeholder="Nouvelle étape..."
            aria-label="Libellé de la nouvelle étape"
            className={inputCls}
          />
          <div className="flex gap-2">
            <select
              name="avantCle"
              defaultValue=""
              aria-label="Position de la nouvelle étape"
              className={`${inputCls} sm:w-44`}
            >
              <option value="">À la fin</option>
              {etapesAffichees.map((e) => (
                <option key={e.cle} value={e.cle}>
                  Avant : {e.libelle}
                </option>
              ))}
            </select>
            <Button type="submit" disabled={pending} className="shrink-0">
              <Plus size={15} />
              Ajouter
            </Button>
          </div>
        </form>
      </section>

      {/* ── Modèle de checklist (pièces types) ────────────────────────── */}
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900 dark:border-slate-800 dark:text-slate-100">
          Pièces types
          <span className="ml-2 text-xs font-normal text-slate-500">
            la checklist posée aux futures affaires
          </span>
        </h2>
        {piecesAffichees.length === 0 && (
          <p className="px-4 py-3 text-xs italic text-slate-400">
            Aucune pièce type : les affaires de cette procédure naîtront
            sans checklist.
          </p>
        )}
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {piecesAffichees.map((p, i) => (
            <li key={p.cle} className="flex items-center gap-1 py-1 pl-4 pr-2">
              <span className="min-w-0 flex-1 truncate text-sm text-slate-800 dark:text-slate-200">
                {p.libelle}
              </span>
              <button
                type="button"
                onClick={() => deplacerLigne("piece", p.cle, "monter")}
                disabled={i === 0 || pending}
                aria-label={`Monter ${p.libelle}`}
                className={boutonIconeCls}
              >
                <ChevronUp size={16} />
              </button>
              <button
                type="button"
                onClick={() => deplacerLigne("piece", p.cle, "descendre")}
                disabled={i === piecesAffichees.length - 1 || pending}
                aria-label={`Descendre ${p.libelle}`}
                className={boutonIconeCls}
              >
                <ChevronDown size={16} />
              </button>
              <button
                type="button"
                onClick={() =>
                  setRenommage({ type: "piece", cle: p.cle, valeur: p.libelle })
                }
                aria-label={`Renommer ${p.libelle}`}
                className={boutonIconeCls}
              >
                <Pencil size={15} />
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (
                    window.confirm(`Retirer la pièce « ${p.libelle} » du modèle ?`)
                  ) {
                    lancer(
                      () =>
                        supprimerPieceModele(procedure.id, { cle: p.cle }),
                      "Pièce retirée du modèle"
                    );
                  }
                }}
                aria-label={`Supprimer ${p.libelle}`}
                className={boutonIconeCls}
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2 border-t border-slate-100 p-3 dark:border-slate-800"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const libelle = String(
              new FormData(form).get("libelle") ?? ""
            ).trim();
            if (!libelle) return;
            lancer(
              () => ajouterPieceModele(procedure.id, { libelle }),
              "Pièce ajoutée au modèle"
            );
            form.reset();
          }}
        >
          <input
            name="libelle"
            maxLength={60}
            placeholder="Nouvelle pièce type..."
            aria-label="Libellé de la nouvelle pièce type"
            className={inputCls}
          />
          <Button type="submit" disabled={pending} className="shrink-0">
            <Plus size={15} />
            Ajouter
          </Button>
        </form>
        <p className="border-t border-slate-100 px-4 py-2.5 text-[11px] leading-relaxed text-slate-500 dark:border-slate-800 dark:text-slate-400">
          Le modèle ne vaut que pour les affaires créées ensuite : les
          affaires existantes gardent leur checklist propre.
        </p>
      </section>

      {/* ── Feuille : renommer (procédure, étape ou pièce) ───────────── */}
      {renommage && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 sm:items-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setRenommage(null);
          }}
        >
          <div
            style={fondOpaque}
            className="w-full rounded-t-2xl border border-slate-200 p-4 shadow-xl dark:border-slate-700 sm:max-w-md sm:rounded-2xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {renommage.type === "procedure"
                  ? "Renommer la procédure"
                  : renommage.type === "etape"
                    ? "Renommer l'étape"
                    : "Renommer la pièce"}
              </h2>
              <button
                type="button"
                onClick={() => setRenommage(null)}
                aria-label="Fermer"
                className="flex h-11 w-11 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={16} />
              </button>
            </div>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const libelle = String(
                  new FormData(e.currentTarget).get("libelle") ?? ""
                ).trim();
                if (!libelle) return;
                const cible = renommage;
                setRenommage(null);
                lancer(
                  () =>
                    cible.type === "procedure"
                      ? majPipeline(procedure.id, { libelle })
                      : cible.type === "etape"
                        ? renommerEtape(procedure.id, { cle: cible.cle, libelle })
                        : renommerPieceModele(procedure.id, {
                            cle: cible.cle,
                            libelle,
                          }),
                  "Renommé"
                );
              }}
            >
              <input
                name="libelle"
                required
                maxLength={60}
                defaultValue={renommage.valeur}
                autoFocus
                className={inputCls}
              />
              <Button type="submit" disabled={pending} className="w-full">
                Enregistrer
              </Button>
            </form>
            {renommage.type === "etape" && (
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                Renommer ne déplace rien : les affaires restent sur cette
                étape, seul le libellé change.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Feuille : supprimer une étape OCCUPÉE (destination imposée) ── */}
      {suppressionEtape && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 sm:items-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSuppressionEtape(null);
          }}
        >
          <div
            style={fondOpaque}
            className="w-full rounded-t-2xl border border-slate-200 p-4 shadow-xl dark:border-slate-700 sm:max-w-md sm:rounded-2xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Supprimer « {suppressionEtape.libelle} »
              </h2>
              <button
                type="button"
                onClick={() => setSuppressionEtape(null)}
                aria-label="Fermer"
                className="flex h-11 w-11 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={16} />
              </button>
            </div>
            <p className="mb-3 text-sm text-slate-700 dark:text-slate-300">
              {suppressionEtape.nbAffaires} affaire
              {suppressionEtape.nbAffaires > 1 ? "s" : ""} vi
              {suppressionEtape.nbAffaires > 1 ? "vent" : "t"} encore sur
              cette étape. Choisissez l&apos;étape qui les accueillera : le
              déplacement et la suppression se font d&apos;un seul geste.
            </p>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const destinationCle = String(
                  new FormData(e.currentTarget).get("destinationCle") ?? ""
                );
                if (!destinationCle) return;
                const cible = suppressionEtape;
                setSuppressionEtape(null);
                lancer(
                  () =>
                    supprimerEtape(procedure.id, {
                      cle: cible.cle,
                      destinationCle,
                    }),
                  "Étape supprimée, affaires déplacées"
                );
              }}
            >
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Étape de destination
                </span>
                <select name="destinationCle" required className={inputCls}>
                  {etapesAffichees
                    .filter((e) => e.cle !== suppressionEtape.cle)
                    .map((e) => (
                      <option key={e.cle} value={e.cle}>
                        {e.libelle}
                      </option>
                    ))}
                </select>
              </label>
              <Button type="submit" disabled={pending} className="w-full">
                Déplacer puis supprimer l&apos;étape
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
