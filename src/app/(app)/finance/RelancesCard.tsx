"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing, RefreshCw } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/Toast";
import { Montant } from "@/features/discret";
import { formatEuro, formatDate } from "@/lib/utils";
import { lancerAnalyseRelances } from "./relances-actions";
import { majStatutDevis } from "./actions";
import { TexteRelanceSheet } from "./TexteRelanceSheet";
import {
  GROUPES_RELANCES,
  PALIER_BADGE,
  type ConstatRelanceUI,
  type RelanceLogUI,
} from "./relances-types";

// ─── Carte « Relances » du cockpit finance ───────────────────────────────────
// Les constats arrivent DÉRIVÉS du serveur (relances-data, mêmes fonctions de
// classification que le moteur) ; ici on rend par groupes, on déclenche
// l'analyse à la demande et on offre les gestes : marquer un devis relancé,
// copier un texte de relance rédigé. Mobile-first : lignes empilées, gestes
// au toucher (aucune action au survol seul).

export function RelancesCard({
  constats,
  historique,
}: {
  constats: ConstatRelanceUI[];
  historique: RelanceLogUI[];
}) {
  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <BellRing size={15} className="text-brand-500" />
            Relances
            <span className="font-normal text-slate-400">
              ({constats.length})
            </span>
          </span>
        </CardTitle>
        <BoutonAnalyser />
      </CardHeader>
      <CardBody className="!p-0">
        {constats.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
            Rien à relancer aujourd'hui. Le balayage quotidien notifie
            l'équipe dès qu'un constat apparaît.
          </p>
        ) : (
          <GroupesConstats constats={constats} lienProjet />
        )}

        {historique.length > 0 && (
          <details className="border-t border-slate-100 dark:border-slate-800">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200">
              Dernières notifications
            </summary>
            <ul className="space-y-1.5 px-4 pb-3">
              {historique.map((h) => (
                <li
                  key={h.id}
                  className="flex items-baseline justify-between gap-3 text-xs text-slate-500 dark:text-slate-400"
                >
                  <span className="min-w-0 truncate">{h.resume}</span>
                  <span className="shrink-0 tabular-nums">
                    {formatDate(h.envoyeLe)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * Encart compact du détail projet : mêmes constats, bornés au chantier par le
 * serveur. La page ne le rend que s'il y a au moins un constat ; le lien vers
 * /finance/[chantierId] est inutile ici (on y est déjà).
 */
export function RelancesProjetCard({
  constats,
}: {
  constats: ConstatRelanceUI[];
}) {
  if (constats.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <BellRing size={15} className="text-brand-500" />
            Relances de ce projet
            <span className="font-normal text-slate-400">
              ({constats.length})
            </span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardBody className="!p-0">
        <GroupesConstats constats={constats} lienProjet={false} />
      </CardBody>
    </Card>
  );
}

function GroupesConstats({
  constats,
  lienProjet,
}: {
  constats: ConstatRelanceUI[];
  lienProjet: boolean;
}) {
  return (
    <div className="pb-1">
      {GROUPES_RELANCES.map((g) => {
        const lignes = constats.filter((c) => c.objetType === g.objetType);
        if (lignes.length === 0) return null;
        return (
          <section key={g.objetType}>
            <h3 className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {g.titre}
            </h3>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {lignes.map((c) => (
                <LigneConstat key={c.cle} c={c} lienProjet={lienProjet} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function LigneConstat({
  c,
  lienProjet,
}: {
  c: ConstatRelanceUI;
  lienProjet: boolean;
}) {
  const badge = PALIER_BADGE[c.palier];
  const sousTitre =
    [c.contexte, lienProjet ? c.chantierNom : null].filter(Boolean).join(" · ") ||
    null;
  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {lienProjet && c.chantierId ? (
            <Link
              href={`/finance/${c.chantierId}`}
              className="block truncate text-sm font-medium text-slate-800 hover:underline dark:text-slate-200"
            >
              {c.libelle}
            </Link>
          ) : (
            <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-200">
              {c.libelle}
            </span>
          )}
          {sousTitre && (
            <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
              {sousTitre}
            </p>
          )}
        </div>
        <span className="shrink-0 text-sm font-medium tabular-nums text-slate-700 dark:text-slate-300">
          <Montant>{formatEuro(c.montant)}</Montant>
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${badge.classe}`}
        >
          {badge.label}
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {c.agePhrase}
        </span>
        <span className="flex-1" />
        {c.objetType === "DEVIS" && (
          <BoutonMarquerRelance devisId={c.objetId} />
        )}
        {c.texteRelance && (
          <TexteRelanceSheet titre={c.libelle} texte={c.texteRelance} />
        )}
      </div>
    </li>
  );
}

function BoutonAnalyser() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const b = await lancerAnalyseRelances();
            toast.info(
              `${b.constats} constat${b.constats > 1 ? "s" : ""}, ` +
                `${b.notifiesNouveaux} notification${b.notifiesNouveaux > 1 ? "s" : ""} envoyée${b.notifiesNouveaux > 1 ? "s" : ""}, ` +
                `${b.dejaTraites} déjà traité${b.dejaTraites > 1 ? "s" : ""}`
            );
            router.refresh();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Erreur");
          }
        })
      }
    >
      <RefreshCw size={14} className={pending ? "animate-spin" : undefined} />
      Analyser maintenant
    </Button>
  );
}

/**
 * Marque le devis relancé via majStatutDevis (statut RELANCE) : l'action
 * incrémente nbRelances et reprogramme prochaineRelance à J+14, ce qui fait
 * taire le constat jusqu'à la prochaine échéance. Aucun message ne part vers
 * le client : on trace un geste que l'utilisateur a fait lui-même.
 */
function BoutonMarquerRelance({ devisId }: { devisId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            await majStatutDevis(devisId, "RELANCE");
            toast.success(
              "Devis marqué relancé : prochaine surveillance dans 14 jours"
            );
            router.refresh();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Erreur");
          }
        })
      }
    >
      <BellRing size={14} />
      Marquer relancé
    </Button>
  );
}
