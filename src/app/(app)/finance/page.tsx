import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, TriangleAlert, FileText, Wallet } from "lucide-react";
import { db } from "@/lib/db";
import {
  requireAuth,
  espaceFilter,
  getAccessibleChantierIds,
} from "@/lib/auth-helpers";
import { getCockpitEspace } from "@/lib/suivi-commercial";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Montant } from "@/features/discret";
import { formatEuro, formatDate } from "@/lib/utils";
import {
  KpiTile,
  BarreAge,
  StatutBadge,
  STATUT_DEVIS,
  STATUT_RETENUE,
} from "./suivi-labels";
import { getConstatsRelances, getDerniersRelanceLogs } from "./relances-data";
import { RelancesCard } from "./RelancesCard";

// ─── Cockpit trésorerie (transverse à l'espace) ─────────────────────────────
// Tout est DÉRIVÉ (reste à encaisser, retard, DSO, balance âgée) : rien n'est
// saisi ici. Bornage par espaceFilter (mode « tous » = union des espaces).

export default async function FinancePage() {
  const me = await requireAuth();
  // Garde de page (audit 2026-07-17) : la garde du layout finance ne
  // protège pas la page elle-même (rendu parallèle Next.js) ; sans ce
  // verrou, le cockpit trésorerie partait aux CHEF/OUVRIER membres.
  if (!me.canPilot) redirect("/aujourdhui");
  // Bornage : l'espace pour tous, ET l'adhésion aux chantiers pour un
  // conducteur (il ne voit pas les projets dont il n'est pas membre). Un admin
  // voit tout l'espace (bornChantier = null).
  const bornChantier = me.isAdmin ? null : await getAccessibleChantierIds(me);
  const filtre = {
    ...espaceFilter(me),
    ...(bornChantier ? { chantierId: { in: bornChantier } } : {}),
  };
  const cockpit = await getCockpitEspace(me.espaceIds, bornChantier);

  // Constats de relance dérivés EN DIRECT (mêmes fonctions de classification
  // que le moteur) ; RelanceLog ne sert qu'au mini historique d'envoi.
  const [constatsRelances, historiqueRelances] = await Promise.all([
    getConstatsRelances({ espaceIds: me.espaceIds, chantierIds: bornChantier }),
    getDerniersRelanceLogs(me.espaceIds, bornChantier),
  ]);

  const [facturesRetard, devisSuivre, retenues, projets] = await Promise.all([
    db.facture.findMany({
      where: {
        ...filtre,
        statutEmission: { not: "ANNULEE" },
        statutReglement: { in: ["NON_PAYEE", "PARTIELLEMENT_PAYEE"] },
        type: { not: "AVOIR" },
        dateEcheance: { lt: bornerAujourdHui() },
      },
      select: {
        id: true,
        objet: true,
        referenceExterne: true,
        montantTTC: true,
        montantPaye: true,
        dateEcheance: true,
        chantier: { select: { id: true, nom: true } },
      },
      orderBy: { dateEcheance: "asc" },
      take: 12,
    }),
    db.devis.findMany({
      where: { ...filtre, statut: { in: ["ENVOYE", "RELANCE"] } },
      select: {
        id: true,
        objet: true,
        montantTTC: true,
        statut: true,
        dateValidite: true,
        chantier: { select: { id: true, nom: true } },
      },
      orderBy: [{ prochaineRelance: "asc" }, { dateEnvoi: "asc" }],
      take: 12,
    }),
    db.retenueGarantie.findMany({
      where: { ...filtre, statut: { in: ["RETENUE", "CONSIGNEE"] } },
      select: {
        id: true,
        montantRetenuCumul: true,
        dateEcheanceLiberation: true,
        statut: true,
        chantier: { select: { id: true, nom: true } },
      },
      orderBy: { dateEcheanceLiberation: "asc" },
      take: 12,
    }),
    db.marche.findMany({
      where: { ...filtre, statut: { not: "CLOTURE" } },
      select: {
        chantierId: true,
        reference: true,
        montantCourantHT: true,
        chantier: { select: { id: true, nom: true, type: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Suivi financier"
        description="Où en sont les devis, factures, acomptes et situations. Tout est calculé, rien n'est ressaisi."
      />

      {/* Tuiles KPI : une colonne sur téléphone, grille au-delà */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiTile
          libelle="Reste à encaisser"
          valeur={cockpit.resteAEncaisser}
          note={`${cockpit.facturesOuvertes} facture${cockpit.facturesOuvertes > 1 ? "s" : ""} ouverte${cockpit.facturesOuvertes > 1 ? "s" : ""}`}
        />
        <KpiTile
          libelle="En retard"
          valeur={cockpit.montantEnRetard}
          ton={cockpit.montantEnRetard > 0 ? "retard" : "ok"}
        />
        <KpiTile
          libelle="Encaissé ce mois"
          valeur={cockpit.encaisseCeMois}
          ton="ok"
        />
        <KpiTile
          libelle="Retenues à libérer"
          valeur={cockpit.retenuesALiberer}
          ton={cockpit.retenuesALiberer > 0 ? "alerte" : "neutre"}
        />
        <KpiTile
          libelle="DSO (jours)"
          valeur={cockpit.dso === null ? "–" : String(cockpit.dso)}
          euro={false}
          ton={cockpit.dso !== null && cockpit.dso > 45 ? "alerte" : "neutre"}
          note="Délai moyen d'encaissement"
        />
      </div>

      {/* Relances : constats ouverts, analyse à la demande, historique */}
      <RelancesCard
        constats={constatsRelances}
        historique={historiqueRelances}
      />

      {/* Balance âgée */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Balance âgée du reste à encaisser</CardTitle>
        </CardHeader>
        <CardBody>
          <BarreAge tranches={cockpit.balanceAgee} />
        </CardBody>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Factures en retard */}
        <Card>
          <CardHeader>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <TriangleAlert size={15} className="text-red-500" />
                Factures en retard
              </span>
            </CardTitle>
          </CardHeader>
          <CardBody className="!p-0">
            {facturesRetard.length === 0 ? (
              <p className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
                Aucune facture en retard.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {facturesRetard.map((f) => {
                  const du =
                    Number(f.montantTTC) - Number(f.montantPaye);
                  return (
                    <li key={f.id} className="px-4 py-2.5">
                      <Link
                        href={`/finance/${f.chantier?.id ?? ""}`}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-slate-800 dark:text-slate-200">
                            {f.objet || f.referenceExterne || "Facture"}
                          </span>
                          <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                            {f.chantier?.nom} · échue le{" "}
                            {formatDate(f.dateEcheance)}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-medium tabular-nums text-red-600 dark:text-red-400">
                          <Montant>{formatEuro(du)}</Montant>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* Devis à suivre */}
        <Card>
          <CardHeader>
            <CardTitle>
              <span className="inline-flex items-center gap-2">
                <FileText size={15} className="text-brand-500" />
                Devis à suivre
              </span>
            </CardTitle>
          </CardHeader>
          <CardBody className="!p-0">
            {devisSuivre.length === 0 ? (
              <p className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
                Aucun devis en attente de réponse.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {devisSuivre.map((d) => (
                  <li key={d.id} className="px-4 py-2.5">
                    <Link
                      href={`/finance/${d.chantier?.id ?? ""}`}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-slate-800 dark:text-slate-200">
                          {d.objet}
                        </span>
                        <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                          {d.chantier?.nom ?? "Sans projet"}
                          {d.dateValidite
                            ? ` · valable jusqu'au ${formatDate(d.dateValidite)}`
                            : ""}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <StatutBadge def={STATUT_DEVIS[d.statut]} />
                        <span className="text-sm font-medium tabular-nums text-slate-700 dark:text-slate-300">
                          <Montant>{formatEuro(Number(d.montantTTC))}</Montant>
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Retenues de garantie */}
      {retenues.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Retenues de garantie à libérer</CardTitle>
          </CardHeader>
          <CardBody className="!p-0">
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {retenues.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <Link
                    href={`/finance/${r.chantier?.id ?? ""}`}
                    className="min-w-0 flex-1"
                  >
                    <span className="block truncate text-sm text-slate-800 dark:text-slate-200">
                      {r.chantier?.nom}
                    </span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      {r.dateEcheanceLiberation
                        ? `Libération prévue le ${formatDate(r.dateEcheanceLiberation)}`
                        : "Date de libération à définir"}
                    </span>
                  </Link>
                  <StatutBadge def={STATUT_RETENUE[r.statut]} />
                  <span className="shrink-0 text-sm font-medium tabular-nums text-amber-600 dark:text-amber-400">
                    <Montant>{formatEuro(Number(r.montantRetenuCumul))}</Montant>
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {/* Projets avec marché */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <Wallet size={15} className="text-slate-500" />
              Projets suivis
            </span>
          </CardTitle>
        </CardHeader>
        <CardBody className="!p-0">
          {projets.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
              Aucun marché suivi. Ouvrez un projet et créez son marché pour
              démarrer le suivi.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {projets.map((m) => (
                <li key={m.chantierId}>
                  <Link
                    href={`/finance/${m.chantierId}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                        {m.chantier?.nom}
                      </span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                        {m.reference} ·{" "}
                        {m.chantier?.type === "ETUDE" ? "Étude" : "Chantier"}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-sm font-medium tabular-nums text-slate-700 dark:text-slate-300">
                        <Montant>{formatEuro(Number(m.montantCourantHT))}</Montant>
                      </span>
                      <ChevronRight size={16} className="text-slate-400" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function bornerAujourdHui(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
