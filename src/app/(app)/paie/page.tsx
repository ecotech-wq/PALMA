import Link from "next/link";
import {
  Plus,
  Banknote,
  ChevronRight,
  Calculator,
  Wallet,
  CheckCircle2,
  AlertCircle,
  Receipt,
  CalendarRange,
} from "lucide-react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Input, Field } from "@/components/ui/Input";
import { calcMontantBrut } from "@/lib/calc-paie";
import { formatEuro, formatDate, cn } from "@/lib/utils";
import { PaiePendingList } from "./PaiePendingList";

const dateRangeFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Construit toutes les plages prédéfinies pour le sélecteur de période */
function buildPeriodPresets() {
  const today = new Date();
  const dow = today.getDay();
  const offsetMon = dow === 0 ? 6 : dow - 1;

  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - offsetMon);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  const last7Start = new Date(today);
  last7Start.setDate(today.getDate() - 6);

  const last30Start = new Date(today);
  last30Start.setDate(today.getDate() - 29);

  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const startPrevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const endPrevMonth = new Date(today.getFullYear(), today.getMonth(), 0);

  return [
    { key: "today", label: "Aujourd'hui", from: isoDay(today), to: isoDay(today) },
    {
      key: "week",
      label: "Cette semaine",
      from: isoDay(startOfWeek),
      to: isoDay(endOfWeek),
    },
    { key: "last7", label: "7 jours", from: isoDay(last7Start), to: isoDay(today) },
    {
      key: "month",
      label: "Ce mois",
      from: isoDay(startOfMonth),
      to: isoDay(endOfMonth),
    },
    {
      key: "prev_month",
      label: "Mois dernier",
      from: isoDay(startPrevMonth),
      to: isoDay(endPrevMonth),
    },
    { key: "last30", label: "30 jours", from: isoDay(last30Start), to: isoDay(today) },
  ];
}

export default async function PaieListPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; from?: string; to?: string }>;
}) {
  const { month: monthParam, from: fromParam, to: toParam } = await searchParams;

  const now = new Date();
  // Période courante : par défaut le mois en cours
  let from: string;
  let to: string;
  if (fromParam && toParam) {
    from = fromParam;
    to = toParam;
  } else if (monthParam) {
    // Compatibilité ancienne URL ?month=YYYY-MM
    const m = monthParam.match(/^(\d{4})-(\d{2})$/);
    if (m) {
      const y = parseInt(m[1], 10);
      const mIdx = parseInt(m[2], 10) - 1;
      from = isoDay(new Date(y, mIdx, 1));
      to = isoDay(new Date(y, mIdx + 1, 0));
    } else {
      from = isoDay(new Date(now.getFullYear(), now.getMonth(), 1));
      to = isoDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    }
  } else {
    from = isoDay(new Date(now.getFullYear(), now.getMonth(), 1));
    to = isoDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  }

  // Bornes UTC pour les requêtes
  const periodStart = new Date(from + "T00:00:00.000Z");
  const periodEnd = new Date(to + "T00:00:00.000Z");
  // Pour les requêtes "lt" : périodEnd + 1 jour
  const periodEndExclusive = new Date(periodEnd);
  periodEndExclusive.setUTCDate(periodEndExclusive.getUTCDate() + 1);

  const periodLabel = `${dateRangeFmt.format(periodStart)} → ${dateRangeFmt.format(periodEnd)}`;
  const isSingleDay = from === to;
  const presets = buildPeriodPresets();
  const activePresetKey = presets.find((p) => p.from === from && p.to === to)?.key;

  const [ouvriers, recentPaiements] = await Promise.all([
    db.ouvrier.findMany({
      where: { actif: true },
      include: {
        pointages: {
          where: { date: { gte: periodStart, lt: periodEndExclusive } },
          select: { joursTravailles: true },
        },
        paiements: {
          where: {
            periodeDebut: { lt: periodEndExclusive },
            periodeFin: { gte: periodStart },
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

  // Catégorisation par statut
  const aVerser: {
    id: string;
    ouvrierId: string;
    ouvrierNom: string;
    periodeDebut: Date;
    periodeFin: Date;
    joursTravailles: number;
    montantNet: number;
    mode: "ESPECES" | "VIREMENT";
  }[] = [];
  const aCalculer: {
    id: string;
    nom: string;
    prenom: string | null;
    typeContrat: string;
    joursMonth: number;
    estime: number;
  }[] = [];
  const payes: {
    id: string;
    ouvrierId: string;
    ouvrierNom: string;
    montantNet: number;
    mode: "ESPECES" | "VIREMENT";
    date: Date;
    paiementId: string;
  }[] = [];
  const sansPointage: { id: string; nom: string; prenom: string | null }[] = [];

  for (const o of ouvriers) {
    const fullName = [o.prenom, o.nom].filter(Boolean).join(" ");
    const joursMonth = o.pointages.reduce(
      (s, p) => s + Number(p.joursTravailles),
      0
    );
    const paye = o.paiements.find((p) => p.statut === "PAYE");
    const calc = o.paiements.find((p) => p.statut === "CALCULE");

    if (paye) {
      payes.push({
        id: o.id,
        ouvrierId: o.id,
        ouvrierNom: fullName,
        montantNet: Number(paye.montantNet),
        mode: paye.mode,
        date: paye.date,
        paiementId: paye.id,
      });
    } else if (calc) {
      aVerser.push({
        id: calc.id,
        ouvrierId: o.id,
        ouvrierNom: fullName,
        periodeDebut: calc.periodeDebut,
        periodeFin: calc.periodeFin,
        joursTravailles: Number(calc.joursTravailles),
        montantNet: Number(calc.montantNet),
        mode: calc.mode,
      });
    } else if (joursMonth > 0) {
      aCalculer.push({
        id: o.id,
        nom: o.nom,
        prenom: o.prenom,
        typeContrat: o.typeContrat,
        joursMonth,
        estime: calcMontantBrut(o.typeContrat, Number(o.tarifBase), joursMonth),
      });
    } else {
      sansPointage.push({ id: o.id, nom: o.nom, prenom: o.prenom });
    }
  }

  // Totaux
  const totalAVerser = aVerser.reduce((s, p) => s + p.montantNet, 0);
  const totalACalculer = aCalculer.reduce((s, o) => s + o.estime, 0);
  const totalPayes = payes.reduce((s, p) => s + p.montantNet, 0);
  const totalActifs = ouvriers.length;
  const progressPct =
    totalActifs > 0 ? Math.round((payes.length / totalActifs) * 100) : 0;
  const aVerserPct =
    totalActifs > 0 ? Math.round((aVerser.length / totalActifs) * 100) : 0;
  const aCalculerPct =
    totalActifs > 0 ? Math.round((aCalculer.length / totalActifs) * 100) : 0;

  // Période YYYY-MM-DD pour les liens "Générer paiement"
  const periodeDebutStr = from;
  const periodeFinStr = to;

  return (
    <div>
      <PageHeader
        title="Paie"
        description={
          activePresetKey === "today"
            ? "Tableau de bord — Aujourd'hui"
            : activePresetKey === "month"
              ? "Tableau de bord du mois en cours"
              : `Tableau de bord — ${periodLabel}`
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

      {/* Sélecteur de période avec presets + plage personnalisée */}
      <Card className="mb-5">
        <CardBody className="!py-3 space-y-3">
          {/* Chips presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-500 dark:text-slate-400 mr-1 inline-flex items-center gap-1">
              <CalendarRange size={13} /> Période :
            </span>
            {presets.map((p) => {
              const isActive = activePresetKey === p.key;
              return (
                <Link
                  key={p.key}
                  href={`/paie?from=${p.from}&to=${p.to}`}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-md border transition",
                    isActive
                      ? "bg-brand-100 dark:bg-brand-900/40 border-brand-300 dark:border-brand-700 text-brand-700 dark:text-brand-300 font-medium"
                      : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                  )}
                >
                  {p.label}
                </Link>
              );
            })}
          </div>

          {/* Range personnalisé */}
          <form
            method="get"
            className="flex flex-col sm:flex-row sm:items-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800"
          >
            <div className="flex-1">
              <Field label="Du">
                <Input type="date" name="from" defaultValue={from} />
              </Field>
            </div>
            <div className="flex-1">
              <Field label="Au">
                <Input type="date" name="to" defaultValue={to} />
              </Field>
            </div>
            <Button type="submit" size="sm" variant="secondary">
              Appliquer
            </Button>
            {activePresetKey !== "month" && (
              <Link
                href="/paie"
                className="text-xs text-slate-500 dark:text-slate-400 hover:underline self-center"
              >
                Réinitialiser
              </Link>
            )}
          </form>

          {/* Indicateur de période active */}
          <div className="text-[11px] text-slate-500 dark:text-slate-500 flex items-center gap-1.5">
            <span className="font-medium">Plage active :</span>
            <span className="text-slate-700 dark:text-slate-300">
              {isSingleDay
                ? dateRangeFmt.format(periodStart)
                : periodLabel}
            </span>
          </div>
        </CardBody>
      </Card>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard
          icon={Calculator}
          label="À calculer"
          value={aCalculer.length}
          subtitle={
            aCalculer.length > 0
              ? `≈ ${formatEuro(totalACalculer)} brut estimé`
              : "Tous calculés"
          }
          color="blue"
        />
        <StatCard
          icon={Wallet}
          label="À verser"
          value={aVerser.length}
          subtitle={
            aVerser.length > 0
              ? `${formatEuro(totalAVerser)} en attente`
              : "Aucun en attente"
          }
          color="yellow"
        />
        <StatCard
          icon={CheckCircle2}
          label="Payés"
          value={payes.length}
          subtitle={
            payes.length > 0
              ? `${formatEuro(totalPayes)} versés`
              : "Aucun versement"
          }
          color="green"
        />
        <StatCard
          icon={AlertCircle}
          label="Sans pointage"
          value={sansPointage.length}
          subtitle={
            sansPointage.length > 0 ? "Pas de pointage sur la période" : "Tous pointés"
          }
          color="gray"
        />
      </div>

      {/* Barre de progression */}
      {totalActifs > 0 && (
        <Card className="mb-5">
          <CardBody>
            <div className="flex items-center justify-between mb-2 text-sm">
              <span className="font-medium text-slate-900 dark:text-slate-100">
                Avancement de la paie
              </span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {payes.length} / {totalActifs} payé
                {payes.length > 1 ? "s" : ""} ({progressPct} %)
              </span>
            </div>
            <div className="h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
              <div
                className="h-full bg-green-500 transition-all"
                style={{ width: `${progressPct}%` }}
              />
              <div
                className="h-full bg-yellow-500 transition-all"
                style={{ width: `${aVerserPct}%` }}
              />
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${aCalculerPct}%` }}
              />
            </div>
          </CardBody>
        </Card>
      )}

      {/* SECTION PROEMINENTE : "À verser" — paiements en attente, sélection bulk */}
      <Card className="mb-5 border-amber-200 dark:border-amber-900 ring-1 ring-amber-200 dark:ring-amber-900/50">
        <CardHeader className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900 flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Wallet size={18} className="text-amber-700 dark:text-amber-400" />
            À verser ({aVerser.length})
            {totalAVerser > 0 && (
              <span className="text-sm font-normal text-amber-700 dark:text-amber-400">
                — {formatEuro(totalAVerser)}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardBody className="!p-0">
          <PaiePendingList paiements={aVerser} />
        </CardBody>
      </Card>

      {/* SECTION : "À calculer" — pointages mais pas de paiement */}
      <Card className="mb-5 border-blue-200 dark:border-blue-900">
        <CardHeader className="bg-blue-50 dark:bg-blue-950/40 border-b border-blue-200 dark:border-blue-900 flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calculator size={18} className="text-blue-700 dark:text-blue-400" />
            À calculer ({aCalculer.length})
            {totalACalculer > 0 && (
              <span className="text-sm font-normal text-blue-700 dark:text-blue-400">
                — ≈ {formatEuro(totalACalculer)} brut
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardBody className="!p-0">
          {aCalculer.length === 0 ? (
            <div className="text-sm text-slate-500 dark:text-slate-400 italic py-3 px-4">
              Aucun ouvrier en attente de paiement à calculer.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {aCalculer.map((o) => {
                const fullName = [o.prenom, o.nom].filter(Boolean).join(" ");
                const generateUrl = `/paie/nouveau?ouvrierId=${o.id}&periodeDebut=${periodeDebutStr}&periodeFin=${periodeFinStr}`;
                return (
                  <li
                    key={o.id}
                    className="px-3 sm:px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-900"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/ouvriers/${o.id}`}
                        className="font-medium text-slate-900 dark:text-slate-100 hover:text-brand-600 truncate flex-1 min-w-0"
                      >
                        {fullName}
                      </Link>
                      <div className="text-right shrink-0">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          ≈ {formatEuro(o.estime)}
                        </div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-500">
                          brut estimé
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-1.5 flex-wrap">
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap min-w-0">
                        <Badge color="blue">À calculer</Badge>
                        <span>
                          {o.joursMonth} j pointé{o.joursMonth > 1 ? "s" : ""}
                        </span>
                        <span>· {o.typeContrat.toLowerCase()}</span>
                      </div>
                      <Link href={generateUrl} className="shrink-0">
                        <Button type="button" size="sm" variant="outline">
                          <Receipt size={14} />
                          Générer
                        </Button>
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* SECTION : "Payés" du mois */}
      <Card className="mb-5">
        <CardHeader className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-green-600" />
            Payés sur la période ({payes.length})
            {totalPayes > 0 && (
              <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
                — {formatEuro(totalPayes)}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardBody className="!p-0">
          {payes.length === 0 ? (
            <div className="text-sm text-slate-500 dark:text-slate-400 italic py-3 px-4">
              Aucun paiement réglé sur la période.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {payes.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/paie/${p.paiementId}`}
                    className="flex items-center gap-2 px-3 sm:px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-900 transition"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                          {p.ouvrierNom}
                        </span>
                        <span className="font-semibold text-slate-900 dark:text-slate-100 shrink-0">
                          {formatEuro(p.montantNet)}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <Badge color="green">Payé</Badge>
                        <span>{formatDate(p.date)}</span>
                        <span>
                          · {p.mode === "ESPECES" ? "Espèces" : "Virement"}
                        </span>
                      </div>
                    </div>
                    <ChevronRight
                      size={16}
                      className="text-slate-300 dark:text-slate-600 shrink-0"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* Sans pointage (info) */}
      {sansPointage.length > 0 && (
        <Card className="mb-5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle size={18} className="text-slate-500" />
              Sans pointage sur la période ({sansPointage.length})
            </CardTitle>
          </CardHeader>
          <CardBody>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              Ces ouvriers actifs n&apos;ont aucun pointage sur la période.
              Vérifie qu&apos;ils ont bien été pointés ou désactive-les si
              besoin.
            </p>
            <div className="flex flex-wrap gap-2">
              {sansPointage.map((o) => {
                const fullName = [o.prenom, o.nom].filter(Boolean).join(" ");
                return (
                  <Link
                    key={o.id}
                    href={`/ouvriers/${o.id}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                  >
                    {fullName}
                    <ChevronRight size={12} />
                  </Link>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}

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
