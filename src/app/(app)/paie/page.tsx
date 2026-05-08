import Link from "next/link";
import {
  Plus,
  Banknote,
  ChevronRight,
  Calculator,
  Wallet,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight as ChevRight,
} from "lucide-react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { calcMontantBrut } from "@/lib/calc-paie";
import { formatEuro, formatDate, cn } from "@/lib/utils";

const monthFmt = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
});

type Statut = "PAYE" | "A_VERSER" | "A_CALCULER" | "PAS_DE_POINTAGE";

const statutMeta: Record<
  Statut,
  {
    label: string;
    color: "green" | "yellow" | "blue" | "slate";
    order: number;
  }
> = {
  A_VERSER: { label: "À verser", color: "yellow", order: 0 },
  A_CALCULER: { label: "À calculer", color: "blue", order: 1 },
  PAYE: { label: "Payé", color: "green", order: 2 },
  PAS_DE_POINTAGE: { label: "Pas de pointage", color: "slate", order: 3 },
};

export default async function PaieListPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParam } = await searchParams;

  const now = new Date();
  let year = now.getFullYear();
  let monthIdx = now.getMonth();
  if (monthParam) {
    const m = monthParam.match(/^(\d{4})-(\d{2})$/);
    if (m) {
      year = parseInt(m[1], 10);
      monthIdx = parseInt(m[2], 10) - 1;
    }
  }
  const monthStart = new Date(Date.UTC(year, monthIdx, 1));
  const monthEnd = new Date(Date.UTC(year, monthIdx + 1, 1));
  const monthLabel = monthFmt.format(monthStart);

  // Mois précédent / suivant pour la nav
  const prevDate = new Date(Date.UTC(year, monthIdx - 1, 1));
  const nextDate = new Date(Date.UTC(year, monthIdx + 1, 1));
  const fmtMonthParam = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const isCurrent =
    year === now.getFullYear() && monthIdx === now.getMonth();

  const [ouvriers, recentPaiements] = await Promise.all([
    db.ouvrier.findMany({
      where: { actif: true },
      include: {
        pointages: {
          where: { date: { gte: monthStart, lt: monthEnd } },
          select: { joursTravailles: true },
        },
        paiements: {
          where: {
            // Recouvre le mois courant
            periodeDebut: { lt: monthEnd },
            periodeFin: { gte: monthStart },
            statut: { in: ["CALCULE", "PAYE"] },
          },
          orderBy: { date: "desc" },
        },
      },
      orderBy: [{ nom: "asc" }, { prenom: "asc" }],
    }),
    db.paiement.findMany({
      include: {
        ouvrier: { select: { id: true, nom: true, prenom: true } },
      },
      orderBy: { date: "desc" },
      take: 20,
    }),
  ]);

  // État par ouvrier pour le mois courant
  const ouvriersWithStatus = ouvriers.map((o) => {
    const joursMonth = o.pointages.reduce(
      (s, p) => s + Number(p.joursTravailles),
      0
    );
    // Le paiement le plus pertinent : payé > calculé
    const paiementPaye = o.paiements.find((p) => p.statut === "PAYE");
    const paiementCalcule = o.paiements.find((p) => p.statut === "CALCULE");
    const paiementMois = paiementPaye ?? paiementCalcule;

    let status: Statut;
    let amount = 0;
    if (paiementPaye) {
      status = "PAYE";
      amount = Number(paiementPaye.montantNet);
    } else if (paiementCalcule) {
      status = "A_VERSER";
      amount = Number(paiementCalcule.montantNet);
    } else if (joursMonth > 0) {
      status = "A_CALCULER";
      amount = calcMontantBrut(
        o.typeContrat,
        Number(o.tarifBase),
        joursMonth
      );
    } else {
      status = "PAS_DE_POINTAGE";
      amount = 0;
    }

    return {
      id: o.id,
      nom: o.nom,
      prenom: o.prenom,
      typeContrat: o.typeContrat,
      joursMonth,
      paiementMoisId: paiementMois?.id ?? null,
      status,
      amount,
    };
  });

  // Tri par statut puis par nom
  ouvriersWithStatus.sort((a, b) => {
    const sd = statutMeta[a.status].order - statutMeta[b.status].order;
    if (sd !== 0) return sd;
    return a.nom.localeCompare(b.nom);
  });

  // Totaux par statut
  const counts = {
    A_CALCULER: 0,
    A_VERSER: 0,
    PAYE: 0,
    PAS_DE_POINTAGE: 0,
  };
  const totals = { A_CALCULER: 0, A_VERSER: 0, PAYE: 0 };
  for (const o of ouvriersWithStatus) {
    counts[o.status]++;
    if (o.status !== "PAS_DE_POINTAGE") totals[o.status] += o.amount;
  }
  const totalActifs = ouvriers.length;
  const progressPct =
    totalActifs > 0
      ? Math.round((counts.PAYE / totalActifs) * 100)
      : 0;

  return (
    <div>
      <PageHeader
        title="Paie"
        description={
          isCurrent
            ? "Tableau de bord du mois en cours"
            : "Tableau de bord paie"
        }
        action={
          <Link href="/paie/nouveau">
            <Button>
              <Plus size={16} />
              <span className="hidden sm:inline">Nouveau paiement</span>
              <span className="sm:hidden">Nouveau</span>
            </Button>
          </Link>
        }
      />

      {/* Sélecteur de mois */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-2 mb-5 flex items-center gap-2">
        <Link href={`/paie?month=${fmtMonthParam(prevDate)}`}>
          <Button variant="ghost" size="icon">
            <ChevronLeft size={18} />
          </Button>
        </Link>
        <div className="flex-1 text-center font-semibold capitalize text-slate-900 dark:text-slate-100">
          {monthLabel}
        </div>
        <Link href={`/paie?month=${fmtMonthParam(nextDate)}`}>
          <Button variant="ghost" size="icon">
            <ChevRight size={18} />
          </Button>
        </Link>
        {!isCurrent && (
          <Link href="/paie">
            <Button variant="outline" size="sm">
              Mois courant
            </Button>
          </Link>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard
          icon={Calculator}
          label="À calculer"
          value={counts.A_CALCULER}
          subtitle={
            counts.A_CALCULER > 0
              ? `≈ ${formatEuro(totals.A_CALCULER)} brut estimé`
              : "Tous calculés"
          }
          color="blue"
        />
        <StatCard
          icon={Wallet}
          label="À verser"
          value={counts.A_VERSER}
          subtitle={
            counts.A_VERSER > 0
              ? `${formatEuro(totals.A_VERSER)} en attente`
              : "Aucun paiement en attente"
          }
          color="yellow"
        />
        <StatCard
          icon={CheckCircle2}
          label="Payés"
          value={counts.PAYE}
          subtitle={
            counts.PAYE > 0
              ? `${formatEuro(totals.PAYE)} versés`
              : "Aucun versement"
          }
          color="green"
        />
        <StatCard
          icon={AlertCircle}
          label="Sans pointage"
          value={counts.PAS_DE_POINTAGE}
          subtitle={
            counts.PAS_DE_POINTAGE > 0
              ? "Pas de pointage ce mois"
              : "Tous pointés"
          }
          color="gray"
        />
      </div>

      {/* Barre de progression de la paie du mois */}
      {totalActifs > 0 && (
        <Card className="mb-5">
          <CardBody>
            <div className="flex items-center justify-between mb-2 text-sm">
              <span className="font-medium text-slate-900 dark:text-slate-100">
                Avancement de la paie
              </span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {counts.PAYE} / {totalActifs} ouvrier
                {totalActifs > 1 ? "s" : ""} payé
                {counts.PAYE > 1 ? "s" : ""} ({progressPct} %)
              </span>
            </div>
            <div className="h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
              <div
                className="h-full bg-green-500 transition-all"
                style={{ width: `${progressPct}%` }}
                title={`${counts.PAYE} payés`}
              />
              <div
                className="h-full bg-yellow-500 transition-all"
                style={{
                  width: `${
                    totalActifs > 0
                      ? Math.round((counts.A_VERSER / totalActifs) * 100)
                      : 0
                  }%`,
                }}
                title={`${counts.A_VERSER} à verser`}
              />
              <div
                className="h-full bg-blue-500 transition-all"
                style={{
                  width: `${
                    totalActifs > 0
                      ? Math.round((counts.A_CALCULER / totalActifs) * 100)
                      : 0
                  }%`,
                }}
                title={`${counts.A_CALCULER} à calculer`}
              />
            </div>
          </CardBody>
        </Card>
      )}

      {/* Tableau ouvrier × statut pour le mois */}
      <Card className="mb-5">
        <CardHeader>
          <CardTitle>État du mois par ouvrier</CardTitle>
        </CardHeader>
        <CardBody className="!p-0">
          {ouvriersWithStatus.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={Banknote}
                title="Aucun ouvrier actif"
                description="Crée des ouvriers actifs pour suivre leur paie ici."
                action={
                  <Link href="/ouvriers/nouveau">
                    <Button>Ajouter un ouvrier</Button>
                  </Link>
                }
              />
            </div>
          ) : (
            <>
              {/* Desktop : table */}
              <div className="hidden md:block">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">
                        Ouvrier
                      </th>
                      <th className="text-right px-4 py-2 font-medium">
                        Jours
                      </th>
                      <th className="text-left px-4 py-2 font-medium">
                        Statut
                      </th>
                      <th className="text-right px-4 py-2 font-medium">
                        Montant
                      </th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {ouvriersWithStatus.map((o) => {
                      const fullName = [o.prenom, o.nom]
                        .filter(Boolean)
                        .join(" ");
                      const meta = statutMeta[o.status];
                      return (
                        <tr
                          key={o.id}
                          className="hover:bg-slate-50 dark:hover:bg-slate-900"
                        >
                          <td className="px-4 py-3">
                            <Link
                              href={`/ouvriers/${o.id}`}
                              className="font-medium text-slate-900 dark:text-slate-100 hover:text-brand-600"
                            >
                              {fullName}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">
                            {o.joursMonth > 0 ? `${o.joursMonth} j` : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <Badge color={meta.color}>{meta.label}</Badge>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-slate-100">
                            {o.amount > 0
                              ? `${o.status === "A_CALCULER" ? "≈ " : ""}${formatEuro(o.amount)}`
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <ActionButton
                              status={o.status}
                              ouvrierId={o.id}
                              paiementId={o.paiementMoisId}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile : cards */}
              <ul className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                {ouvriersWithStatus.map((o) => {
                  const fullName = [o.prenom, o.nom]
                    .filter(Boolean)
                    .join(" ");
                  const meta = statutMeta[o.status];
                  return (
                    <li key={o.id} className="p-3">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <Link
                          href={`/ouvriers/${o.id}`}
                          className="font-medium text-slate-900 dark:text-slate-100 hover:text-brand-600 truncate"
                        >
                          {fullName}
                        </Link>
                        <Badge color={meta.color}>{meta.label}</Badge>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                        <span>
                          {o.joursMonth > 0 ? `${o.joursMonth} j` : "—"}
                        </span>
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {o.amount > 0
                            ? `${o.status === "A_CALCULER" ? "≈ " : ""}${formatEuro(o.amount)}`
                            : "—"}
                        </span>
                      </div>
                      <div className="mt-2">
                        <ActionButton
                          status={o.status}
                          ouvrierId={o.id}
                          paiementId={o.paiementMoisId}
                          fullWidth
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </CardBody>
      </Card>

      {/* Historique récent */}
      <Card>
        <CardHeader>
          <CardTitle>Historique récent (20 derniers paiements)</CardTitle>
        </CardHeader>
        <CardBody className="!p-0">
          {recentPaiements.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={Banknote}
                title="Aucun paiement dans l'historique"
                description="Les paiements générés apparaîtront ici, tous statuts confondus."
              />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {recentPaiements.map((p) => {
                const fullName = [p.ouvrier.prenom, p.ouvrier.nom]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <li key={p.id}>
                    <Link
                      href={`/paie/${p.id}`}
                      className="flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-900 transition"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                          {fullName}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                          <span>
                            Du {formatDate(p.periodeDebut)} au{" "}
                            {formatDate(p.periodeFin)} ·{" "}
                            {Number(p.joursTravailles)} j
                          </span>
                          {p.statut === "PAYE" ? (
                            <Badge color="green">Payé</Badge>
                          ) : p.statut === "ANNULE" ? (
                            <Badge color="red">Annulé</Badge>
                          ) : (
                            <Badge color="yellow">À verser</Badge>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-semibold">
                          {formatEuro(p.montantNet.toString())}
                        </div>
                        <div className="text-xs text-slate-400 dark:text-slate-500">
                          {p.mode === "ESPECES" ? "Espèces" : "Virement"}
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-slate-300" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  subtitle,
  color,
}: {
  icon: typeof Banknote;
  label: string;
  value: number;
  subtitle: string;
  color: "blue" | "yellow" | "green" | "gray";
}) {
  const colorMap = {
    blue: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900",
    yellow:
      "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900",
    green:
      "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 border-green-200 dark:border-green-900",
    gray: "bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800",
  };
  return (
    <div
      className={cn(
        "rounded-xl border p-3 flex flex-col gap-1",
        colorMap[color]
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider opacity-80">
          {label}
        </span>
        <Icon size={16} className="opacity-70" />
      </div>
      <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
        {value}
      </div>
      <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
        {subtitle}
      </div>
    </div>
  );
}

function ActionButton({
  status,
  ouvrierId,
  paiementId,
  fullWidth,
}: {
  status: Statut;
  ouvrierId: string;
  paiementId: string | null;
  fullWidth?: boolean;
}) {
  if (status === "A_CALCULER") {
    return (
      <Link href={`/paie/nouveau?ouvrierId=${ouvrierId}`}>
        <Button size="sm" className={fullWidth ? "w-full" : ""}>
          Générer
        </Button>
      </Link>
    );
  }
  if (status === "A_VERSER" || status === "PAYE") {
    if (!paiementId) return null;
    return (
      <Link href={`/paie/${paiementId}`}>
        <Button
          size="sm"
          variant="outline"
          className={fullWidth ? "w-full" : ""}
        >
          Voir
        </Button>
      </Link>
    );
  }
  return null;
}
