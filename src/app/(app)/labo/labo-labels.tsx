import { Badge, type BadgeColor } from "@/components/ui/Badge";
import type { ConstatEssai } from "@/lib/labo-calc";

// ─── Module labo : libellés, badges de statut / échéance / verdict, tuiles ───
// Sémantique couleur de la charte (jamais portée par la seule couleur : le
// libellé texte est toujours présent) : vert = conforme, terracotta (rouge) =
// non conforme ou échu, ambre = échéance proche (signal), bleu = en cours,
// gris = planifié ou annulé. Un seul endroit pour changer la présentation,
// même motif que finance/suivi-labels.

type Def = { label: string; color: BadgeColor };

export const STATUT_ESSAI: Record<string, Def> = {
  PLANIFIE: { label: "Planifié", color: "slate" },
  EN_COURS: { label: "En cours", color: "blue" },
  VALIDE: { label: "Validé", color: "green" },
  ANNULE: { label: "Annulé", color: "slate" },
};

export function StatutEssaiBadge({ statut }: { statut: string }) {
  const def = STATUT_ESSAI[statut];
  if (!def) return null;
  return <Badge color={def.color}>{def.label}</Badge>;
}

/**
 * Badge d'échéance d'un essai ouvert : terracotta si échu, ambre si à
 * 3 jours ou moins (constat produit par classerEssai, lib/labo-calc).
 */
export function EcheanceBadge({ constat }: { constat: ConstatEssai | null }) {
  if (!constat) return null;
  if (constat.classe === "ECHU") {
    return (
      <Badge color="red">
        Échu · {constat.jours} j de retard
      </Badge>
    );
  }
  return (
    <Badge color="yellow">
      {constat.jours === 0 ? "Aujourd'hui" : `Dans ${constat.jours} j`}
    </Badge>
  );
}

/** Verdict de conformité : vert conforme, terracotta non conforme. */
export function VerdictBadge({ conforme }: { conforme: boolean | null }) {
  if (conforme === null) return null;
  return conforme ? (
    <Badge color="green">Conforme</Badge>
  ) : (
    <Badge color="red">Non conforme</Badge>
  );
}

/**
 * Tuile compteur du tableau de bord labo : un grand nombre lisible, un
 * libellé, un ton sémantique et une note de contexte (motif KpiTile du
 * suivi financier, sans montant).
 */
export function CompteurTile({
  libelle,
  valeur,
  ton = "neutre",
  note,
}: {
  libelle: string;
  valeur: number;
  ton?: "neutre" | "ok" | "alerte" | "retard";
  note?: string;
}) {
  const tonClasse =
    ton === "retard"
      ? "text-red-600 dark:text-red-400"
      : ton === "alerte"
        ? "text-amber-600 dark:text-amber-400"
        : ton === "ok"
          ? "text-green-600 dark:text-green-400"
          : "text-slate-900 dark:text-slate-100";
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {libelle}
      </p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${tonClasse}`}>
        {valeur}
      </p>
      {note && (
        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
          {note}
        </p>
      )}
    </div>
  );
}

/** « 22,5 » : nombre au format français, sans zéros parasites. */
export function fmtValeur(n: number): string {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}
