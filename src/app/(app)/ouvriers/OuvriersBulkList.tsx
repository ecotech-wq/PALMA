"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Phone, User, ChevronRight, CheckSquare, Square } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/Toast";
import { OuvrierActiveToggle } from "./OuvrierActiveToggle";
import { bulkToggleOuvriers } from "./actions";
import { formatEuro, cn } from "@/lib/utils";

const contratLabel: Record<string, string> = {
  FIXE: "Fixe",
  JOUR: "Journalier",
  SEMAINE: "Hebdo",
  MOIS: "Au mois",
  FORFAIT: "Forfait",
};
const tarifSuffix: Record<string, string> = {
  FIXE: "/mois",
  MOIS: "/mois",
  SEMAINE: "/sem",
  JOUR: "/jour",
  FORFAIT: " forfait",
};

type Ouvrier = {
  id: string;
  nom: string;
  prenom: string | null;
  photo: string | null;
  telephone: string | null;
  typeContrat: string;
  tarifBase: string;
  actif: boolean;
  equipeNom: string | null;
};

/**
 * Liste cliente des ouvriers avec sélection multiple + actions bulk
 * (activer / désactiver plusieurs ouvriers d'un coup).
 */
export function OuvriersBulkList({
  ouvriers,
  isAdmin = true,
}: {
  ouvriers: Ouvrier[];
  isAdmin?: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === ouvriers.length) setSelected(new Set());
    else setSelected(new Set(ouvriers.map((o) => o.id)));
  }

  function applyBulk(actif: boolean) {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    const action = actif ? "activer" : "désactiver";
    if (
      !confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${ids.length} ouvrier${ids.length > 1 ? "s" : ""} ?`)
    )
      return;
    startTransition(async () => {
      try {
        const count = await bulkToggleOuvriers(ids, actif);
        toast.success(
          `${count} ouvrier${count > 1 ? "s" : ""} ${actif ? "activé" : "désactivé"}${count > 1 ? "s" : ""}`
        );
        setSelected(new Set());
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  const allSelected = selected.size === ouvriers.length && ouvriers.length > 0;
  const hasSelection = selected.size > 0;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      {/* Barre bulk */}
      <div
        className={cn(
          "flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-800 text-sm transition-colors",
          hasSelection
            ? "bg-brand-50 dark:bg-brand-900/30"
            : "bg-slate-50 dark:bg-slate-800/50"
        )}
      >
        <button
          type="button"
          onClick={toggleAll}
          className="flex items-center gap-2 text-slate-700 dark:text-slate-300 hover:text-brand-600"
        >
          {allSelected ? (
            <CheckSquare size={16} />
          ) : (
            <Square size={16} />
          )}
          <span>
            {hasSelection
              ? `${selected.size} sélectionné${selected.size > 1 ? "s" : ""}`
              : "Tout sélectionner"}
          </span>
        </button>
        {hasSelection && (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              onClick={() => applyBulk(true)}
              disabled={pending}
            >
              Activer
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => applyBulk(false)}
              disabled={pending}
            >
              Désactiver
            </Button>
          </div>
        )}
      </div>

      {/* Lignes */}
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {ouvriers.map((o) => {
          const fullName = [o.prenom, o.nom].filter(Boolean).join(" ");
          const isSel = selected.has(o.id);
          return (
            <li
              key={o.id}
              className={cn(
                "flex items-center gap-3 p-3 transition",
                isSel
                  ? "bg-brand-50/40 dark:bg-brand-900/20"
                  : "hover:bg-slate-50 dark:hover:bg-slate-900"
              )}
            >
              <input
                type="checkbox"
                checked={isSel}
                onChange={() => toggle(o.id)}
                onClick={(e) => e.stopPropagation()}
                className="rounded border-slate-400 text-brand-600 focus:ring-brand-500 shrink-0"
                aria-label={`Sélectionner ${fullName}`}
              />
              <Link
                href={`/ouvriers/${o.id}`}
                className="flex items-center gap-3 flex-1 min-w-0"
              >
                <div
                  className={cn(
                    "w-12 h-12 shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden relative",
                    !o.actif && "opacity-50"
                  )}
                >
                  {o.photo ? (
                    <Image
                      src={o.photo}
                      alt={fullName}
                      fill
                      sizes="48px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-slate-400 dark:text-slate-500">
                      <User size={20} />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={cn(
                        "font-medium truncate",
                        o.actif
                          ? "text-slate-900 dark:text-slate-100"
                          : "text-slate-500 dark:text-slate-400"
                      )}
                    >
                      {fullName}
                    </span>
                    {!o.actif && <Badge color="slate">Inactif</Badge>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {o.telephone && (
                      <span className="flex items-center gap-1">
                        <Phone size={11} /> {o.telephone}
                      </span>
                    )}
                    {o.equipeNom && <span>· {o.equipeNom}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0 hidden sm:block">
                  <Badge color="blue">{contratLabel[o.typeContrat]}</Badge>
                  {isAdmin && (
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100 mt-1">
                      {formatEuro(o.tarifBase)}
                      <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                        {tarifSuffix[o.typeContrat]}
                      </span>
                    </div>
                  )}
                </div>
              </Link>
              <OuvrierActiveToggle ouvrierId={o.id} actif={o.actif} />
              <Link
                href={`/ouvriers/${o.id}`}
                className="text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 shrink-0"
                aria-label="Voir la fiche"
              >
                <ChevronRight size={16} />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
