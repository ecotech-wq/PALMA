import { Badge, type BadgeColor } from "@/components/ui/Badge";
import { Montant } from "@/features/discret";
import { formatEuro } from "@/lib/utils";

// ─── Suivi financier : libellés, couleurs de statut, tuiles KPI ──────────────
// Sémantique couleur constante (jamais portée par la seule couleur : toujours
// un libellé texte) : vert=payé/ok, ambre=alerte, rouge=retard/refus,
// bleu=neutre/en cours, gris=brouillon. Réutilisable partout, un seul endroit
// pour changer la présentation.

type Def = { label: string; color: BadgeColor };

export const STATUT_DEVIS: Record<string, Def> = {
  BROUILLON: { label: "Brouillon", color: "slate" },
  ENVOYE: { label: "Envoyé", color: "blue" },
  RELANCE: { label: "Relancé", color: "yellow" },
  ACCEPTE: { label: "Accepté", color: "green" },
  REFUSE: { label: "Refusé", color: "red" },
  EXPIRE: { label: "Expiré", color: "orange" },
};

export const STATUT_EMISSION: Record<string, Def> = {
  BROUILLON: { label: "Brouillon", color: "slate" },
  EMISE: { label: "Émise", color: "blue" },
  ENVOYEE: { label: "Envoyée", color: "blue" },
  ANNULEE: { label: "Annulée", color: "slate" },
};

export const STATUT_REGLEMENT: Record<string, Def> = {
  NON_PAYEE: { label: "Non payée", color: "yellow" },
  PARTIELLEMENT_PAYEE: { label: "Partielle", color: "orange" },
  PAYEE: { label: "Payée", color: "green" },
  ANNULEE: { label: "Annulée", color: "slate" },
};

export const STATUT_SITUATION: Record<string, Def> = {
  BROUILLON: { label: "Brouillon", color: "slate" },
  TRANSMISE: { label: "Transmise", color: "blue" },
  VISEE_MOE: { label: "Visée MOE", color: "blue" },
  ACCEPTEE: { label: "Acceptée", color: "green" },
  FACTUREE: { label: "Facturée", color: "purple" },
  PAYEE: { label: "Payée", color: "green" },
  PARTIELLEMENT_PAYEE: { label: "Partielle", color: "orange" },
  CONTESTEE: { label: "Contestée", color: "red" },
};

export const STATUT_MARCHE: Record<string, Def> = {
  BROUILLON: { label: "Brouillon", color: "slate" },
  ACTIF: { label: "Actif", color: "green" },
  RECEPTIONNE: { label: "Réceptionné", color: "blue" },
  SOLDE: { label: "Soldé", color: "purple" },
  CLOTURE: { label: "Clôturé", color: "slate" },
};

export const STATUT_RETENUE: Record<string, Def> = {
  RETENUE: { label: "Retenue", color: "yellow" },
  CONSIGNEE: { label: "Consignée", color: "blue" },
  CAUTIONNEE: { label: "Cautionnée", color: "blue" },
  LIBEREE: { label: "Libérée", color: "green" },
  OPPOSITION: { label: "Opposition", color: "red" },
};

export const TYPE_FACTURE: Record<string, string> = {
  ACOMPTE: "Acompte",
  SITUATION: "Situation",
  SOLDE: "Solde",
  HONORAIRES: "Honoraires",
  AVOIR: "Avoir",
};

export const SOURCE_DOC: Record<string, string> = {
  ODOO: "Odoo",
  CONSTRUCTOR: "Constructor",
  MANUEL: "Manuel",
  AUTRE: "Autre",
};

export function StatutBadge({
  def,
}: {
  def: Def | undefined;
}) {
  if (!def) return null;
  return <Badge color={def.color}>{def.label}</Badge>;
}

/**
 * Tuile KPI mobile-first : un grand nombre lisible, un libellé, un ton
 * sémantique optionnel et une note de contexte. Le montant passe par
 * <Montant> (mode discret). Pas de jauge circulaire décorative.
 */
export function KpiTile({
  libelle,
  valeur,
  euro = true,
  ton = "neutre",
  note,
}: {
  libelle: string;
  valeur: number | string;
  euro?: boolean;
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
  const contenu =
    typeof valeur === "number" && euro ? formatEuro(valeur) : String(valeur);
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {libelle}
      </p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${tonClasse}`}>
        {euro && typeof valeur === "number" ? (
          <Montant>{contenu}</Montant>
        ) : (
          contenu
        )}
      </p>
      {note && (
        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
          {note}
        </p>
      )}
    </div>
  );
}

/**
 * Balance âgée en barre horizontale empilée (jamais un camembert au-delà de
 * deux catégories). Couleurs de plus en plus chaudes avec l'ancienneté ;
 * chaque tranche non nulle porte son libellé et son montant sous la barre.
 */
export function BarreAge({
  tranches,
}: {
  tranches: { cle: string; libelle: string; montant: number }[];
}) {
  const total = tranches.reduce((s, t) => s + t.montant, 0);
  const couleur: Record<string, string> = {
    non_echu: "bg-slate-300 dark:bg-slate-600",
    "0_30": "bg-yellow-400",
    "31_60": "bg-amber-500",
    "61_90": "bg-orange-500",
    plus_90: "bg-red-500",
  };
  if (total <= 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Rien à encaisser.
      </p>
    );
  }
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        {tranches.map((t) =>
          t.montant > 0 ? (
            <div
              key={t.cle}
              className={couleur[t.cle]}
              style={{ width: `${(t.montant / total) * 100}%` }}
              title={`${t.libelle} : ${formatEuro(t.montant)}`}
            />
          ) : null
        )}
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
        {tranches.map((t) =>
          t.montant > 0 ? (
            <li
              key={t.cle}
              className="flex items-center justify-between text-xs"
            >
              <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${couleur[t.cle]}`}
                />
                {t.libelle}
              </span>
              <span className="tabular-nums text-slate-700 dark:text-slate-300">
                <Montant>{formatEuro(t.montant)}</Montant>
              </span>
            </li>
          ) : null
        )}
      </ul>
    </div>
  );
}
