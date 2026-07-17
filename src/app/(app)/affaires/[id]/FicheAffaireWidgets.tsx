"use client";

// ─── Widgets client de la fiche affaire ──────────────────────────────────────
// Petits composants d'édition en place (checklist, prochaine action,
// responsable, issues). Chacun appelle sa server action puis rafraîchit la
// route : l'état de vérité reste côté serveur.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CheckCircle2,
  Hammer,
  Pencil,
  Plus,
  ThumbsDown,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/Toast";
import { usePanneauOpaque } from "@/lib/usePanneauOpaque";
import type { ChecklistItem } from "@/lib/affaires";
import {
  assignerAction,
  cocherChecklist,
  convertirEnChantier,
  gagnerAffaire,
  majAffaire,
  perdreAffaire,
  rouvrirAffaire,
} from "../actions";

const inputCls =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

/* -------------------------------------------------------------------------
 *  Checklist cochable
 * ----------------------------------------------------------------------- */

export function ChecklistAffaire({
  affaireId,
  items,
  canEdit,
}: {
  affaireId: string;
  items: ChecklistItem[];
  canEdit: boolean;
}) {
  const [pendingCle, setPendingCle] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();

  if (items.length === 0) {
    return (
      <p className="text-xs italic text-slate-400">
        Pas de checklist pour cette typologie.
      </p>
    );
  }

  return (
    <ul className="space-y-1.5">
      {items.map((it) => (
        <li key={it.cle}>
          <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60">
            <input
              type="checkbox"
              checked={it.fait}
              disabled={!canEdit || pendingCle === it.cle}
              onChange={(e) => {
                setPendingCle(it.cle);
                cocherChecklist(affaireId, it.cle, e.target.checked)
                  .then(() => router.refresh())
                  .catch((err: unknown) =>
                    toast.error(err instanceof Error ? err.message : "Erreur")
                  )
                  .finally(() => setPendingCle(null));
              }}
              className="h-4 w-4 accent-slate-900 dark:accent-slate-200"
            />
            <span
              className={
                it.fait
                  ? "text-slate-400 line-through"
                  : "text-slate-800 dark:text-slate-200"
              }
            >
              {it.libelle}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------
 *  Prochaine action datée (édition rapide en place)
 * ----------------------------------------------------------------------- */

export function ProchaineActionEdit({
  affaireId,
  prochaineAction,
  prochaineActionLe,
  enRetard,
  canEdit,
}: {
  affaireId: string;
  prochaineAction: string | null;
  /** "AAAA-MM-JJ" ou null. */
  prochaineActionLe: string | null;
  enRetard: boolean;
  canEdit: boolean;
}) {
  const [edition, setEdition] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  if (!edition) {
    return (
      <div className="flex items-start gap-2">
        <CalendarClock
          size={16}
          className={`mt-0.5 shrink-0 ${
            enRetard ? "text-brand-600" : "text-slate-400"
          }`}
        />
        <div className="min-w-0 flex-1 text-sm">
          {prochaineAction ? (
            <>
              <span className="text-slate-800 dark:text-slate-200">
                {prochaineAction}
              </span>
              {prochaineActionLe && (
                <span
                  className={
                    enRetard
                      ? "ml-1.5 font-medium text-brand-700 dark:text-brand-400"
                      : "ml-1.5 text-slate-500"
                  }
                >
                  pour le{" "}
                  {new Date(
                    prochaineActionLe + "T00:00:00.000Z"
                  ).toLocaleDateString("fr-FR", { timeZone: "UTC" })}
                  {enRetard ? " (en retard)" : ""}
                </span>
              )}
            </>
          ) : (
            <span className="italic text-slate-400">
              Aucune prochaine action planifiée
            </span>
          )}
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setEdition(true)}
            aria-label="Modifier la prochaine action"
            className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
          >
            <Pencil size={14} />
          </button>
        )}
      </div>
    );
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const texte = String(fd.get("prochaineAction") ?? "").trim();
        const date = String(fd.get("prochaineActionLe") ?? "");
        startTransition(async () => {
          try {
            await majAffaire(affaireId, {
              prochaineAction: texte || null,
              prochaineActionLe: date || null,
            });
            toast.success("Prochaine action mise à jour");
            setEdition(false);
            router.refresh();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Erreur");
          }
        });
      }}
    >
      <input
        name="prochaineAction"
        defaultValue={prochaineAction ?? ""}
        placeholder="Rappeler le client, relancer la mairie..."
        className={inputCls}
      />
      <div className="flex items-center gap-2">
        <input
          name="prochaineActionLe"
          type="date"
          defaultValue={prochaineActionLe ?? ""}
          className={inputCls}
        />
        <Button type="submit" size="sm" disabled={pending}>
          Enregistrer
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setEdition(false)}
        >
          Annuler
        </Button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------
 *  Responsable (select en place, motif ChangerStatut du suivi financier)
 * ----------------------------------------------------------------------- */

export function ResponsableSelect({
  affaireId,
  responsableId,
  responsables,
  canEdit,
}: {
  affaireId: string;
  responsableId: string | null;
  responsables: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  return (
    <select
      aria-label="Responsable de l'affaire"
      value={responsableId ?? ""}
      disabled={!canEdit || pending}
      onChange={(e) => {
        const cible = e.target.value || null;
        startTransition(async () => {
          try {
            await majAffaire(affaireId, { responsableId: cible });
            toast.success("Responsable mis à jour");
            router.refresh();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Erreur");
          }
        });
      }}
      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 disabled:opacity-60"
    >
      <option value="">Personne</option>
      {responsables.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
        </option>
      ))}
    </select>
  );
}

/* -------------------------------------------------------------------------
 *  Contact et valeur (petite feuille d'édition)
 * ----------------------------------------------------------------------- */

export function ContactEdit({
  affaireId,
  contactNom,
  contactTel,
  contactEmail,
  adresse,
  valeurEstimee,
}: {
  affaireId: string;
  contactNom: string;
  contactTel: string | null;
  contactEmail: string | null;
  adresse: string | null;
  valeurEstimee: number | null;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const fondOpaque = usePanneauOpaque();

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        aria-label="Modifier le contact"
        className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
      >
        <Pencil size={14} />
      </button>
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
                Contact et valeur
              </h2>
              <button
                type="button"
                onClick={() => setOuvert(false)}
                aria-label="Fermer"
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={16} />
              </button>
            </div>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const valeur = String(fd.get("valeurEstimee") ?? "").trim();
                startTransition(async () => {
                  try {
                    await majAffaire(affaireId, {
                      contactNom: String(fd.get("contactNom") ?? ""),
                      contactTel: String(fd.get("contactTel") ?? "") || null,
                      contactEmail:
                        String(fd.get("contactEmail") ?? "") || null,
                      adresse: String(fd.get("adresse") ?? "") || null,
                      valeurEstimee: valeur ? Number(valeur) : null,
                    });
                    toast.success("Fiche mise à jour");
                    setOuvert(false);
                    router.refresh();
                  } catch (err) {
                    toast.error(
                      err instanceof Error ? err.message : "Erreur"
                    );
                  }
                });
              }}
            >
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Contact
                </span>
                <input
                  name="contactNom"
                  required
                  defaultValue={contactNom}
                  className={inputCls}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Téléphone
                  </span>
                  <input
                    name="contactTel"
                    type="tel"
                    defaultValue={contactTel ?? ""}
                    className={inputCls}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                    Valeur (EUR)
                  </span>
                  <input
                    name="valeurEstimee"
                    type="number"
                    min="0"
                    step="100"
                    defaultValue={valeurEstimee ?? ""}
                    className={`${inputCls} font-mono`}
                  />
                </label>
              </div>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Courriel
                </span>
                <input
                  name="contactEmail"
                  type="email"
                  defaultValue={contactEmail ?? ""}
                  className={inputCls}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Adresse du projet
                </span>
                <input
                  name="adresse"
                  defaultValue={adresse ?? ""}
                  className={inputCls}
                />
              </label>
              <Button type="submit" disabled={pending} className="w-full">
                Enregistrer
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------
 *  Confier une action (tâche perso reliée à l'affaire)
 * ----------------------------------------------------------------------- */

export function AssignerActionForm({
  affaireId,
  cibles,
}: {
  affaireId: string;
  cibles: { id: string; name: string }[];
}) {
  const [ouvert, setOuvert] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const aujourdhui = new Date().toISOString().slice(0, 10);

  if (!ouvert) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOuvert(true)}>
        <Plus size={14} />
        Confier une action
      </Button>
    );
  }

  return (
    <form
      className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          try {
            await assignerAction(affaireId, {
              cibleId: String(fd.get("cibleId") ?? ""),
              nom: String(fd.get("nom") ?? ""),
              dateDebut: String(fd.get("dateDebut") ?? aujourdhui),
              dateFin: String(fd.get("dateFin") ?? aujourdhui),
            });
            toast.success("Action confiée");
            setOuvert(false);
            router.refresh();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Erreur");
          }
        });
      }}
    >
      <input
        name="nom"
        required
        placeholder="Préparer le devis, appeler le géomètre..."
        className={inputCls}
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Pour
          </span>
          <select name="cibleId" required className={inputCls}>
            {cibles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Échéance
          </span>
          <input
            name="dateFin"
            type="date"
            required
            defaultValue={aujourdhui}
            className={inputCls}
          />
        </label>
      </div>
      <input type="hidden" name="dateDebut" value={aujourdhui} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          Confier
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setOuvert(false)}
        >
          Annuler
        </Button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------
 *  Issues : gagner / perdre / rouvrir / convertir en chantier
 * ----------------------------------------------------------------------- */

export function IssuesAffaire({
  affaireId,
  statut,
  chantierId,
}: {
  affaireId: string;
  statut: "EN_COURS" | "GAGNEE" | "PERDUE";
  chantierId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function lancer(fn: () => Promise<unknown>, ok: string) {
    startTransition(async () => {
      try {
        await fn();
        toast.success(ok);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur");
      }
    });
  }

  if (statut === "EN_COURS") {
    return (
      <div className="flex flex-wrap gap-2">
        {/* Gagner = l'engagement de l'écran : le seul bouton ambre. */}
        <Button
          size="sm"
          variant="signal"
          disabled={pending}
          onClick={() => lancer(() => gagnerAffaire(affaireId), "Affaire gagnée")}
        >
          <CheckCircle2 size={14} />
          Gagner
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            const motif = window.prompt("Motif de la perte :");
            if (!motif || !motif.trim()) return;
            lancer(() => perdreAffaire(affaireId, motif), "Affaire close");
          }}
        >
          <ThumbsDown size={14} />
          Perdre
        </Button>
      </div>
    );
  }

  if (statut === "GAGNEE") {
    return (
      <div className="flex flex-wrap gap-2">
        {chantierId ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push(`/chantiers/${chantierId}`)}
          >
            <Hammer size={14} />
            Voir le chantier
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  const { chantierId: nouveau } =
                    await convertirEnChantier(affaireId);
                  toast.success("Chantier créé");
                  router.push(`/chantiers/${nouveau}`);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Erreur");
                }
              })
            }
          >
            <Hammer size={14} />
            Convertir en chantier
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => lancer(() => rouvrirAffaire(affaireId), "Affaire rouverte")}
        >
          Rouvrir
        </Button>
      </div>
    );
  }

  // PERDUE
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => lancer(() => rouvrirAffaire(affaireId), "Affaire rouverte")}
    >
      Rouvrir l&apos;affaire
    </Button>
  );
}
