import Link from "next/link";
import { Calendar, CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { PointageGrid } from "./PointageGrid";
import { PointageCalendar } from "./PointageCalendar";
import { DatePicker } from "./DatePicker";
import { savePointage, savePointageBatch } from "./actions";
import { cn } from "@/lib/utils";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shiftDate(date: string, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

export default async function PointagePage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string;
    mode?: string;
    ouvrierId?: string;
    month?: string;
  }>;
}) {
  const {
    date: dateParam,
    mode: modeParam,
    ouvrierId: ouvrierIdParam,
    month: monthParam,
  } = await searchParams;
  const date = dateParam || isoDate(new Date());
  const dateObj = new Date(date);
  const dayDate = new Date(date + "T00:00:00.000Z");
  const mode = modeParam === "plage" ? "plage" : "jour";

  // Mois affiché en mode plage (par défaut : mois courant)
  const now = new Date();
  let year = now.getFullYear();
  let monthIdx = now.getMonth(); // 0-11
  if (monthParam) {
    const m = monthParam.match(/^(\d{4})-(\d{2})$/);
    if (m) {
      year = parseInt(m[1], 10);
      monthIdx = parseInt(m[2], 10) - 1;
    }
  }

  const [ouvriers, chantiers] = await Promise.all([
    db.ouvrier.findMany({
      where: { actif: true },
      include: {
        equipe: { include: { chantier: { select: { id: true, nom: true } } } },
        pointages: { where: { date: dayDate }, take: 1 },
      },
      orderBy: [{ equipeId: "asc" }, { nom: "asc" }],
    }),
    db.chantier.findMany({
      where: { statut: { in: ["PLANIFIE", "EN_COURS", "PAUSE"] } },
      select: { id: true, nom: true },
      orderBy: { nom: "asc" },
    }),
  ]);

  // En mode plage, on charge les pointages du mois pour l'ouvrier sélectionné
  let calendarInitialPointages: { date: string; jours: number }[] = [];
  let calendarDefaultChantierId: string | null = null;
  const selectedOuvrierId =
    mode === "plage"
      ? ouvrierIdParam ?? ouvriers[0]?.id ?? undefined
      : undefined;

  if (mode === "plage" && selectedOuvrierId) {
    const monthStart = new Date(Date.UTC(year, monthIdx, 1));
    const monthEnd = new Date(Date.UTC(year, monthIdx + 1, 1));
    const ouvrierPointages = await db.pointage.findMany({
      where: {
        ouvrierId: selectedOuvrierId,
        date: { gte: monthStart, lt: monthEnd },
      },
      select: { date: true, joursTravailles: true },
    });
    calendarInitialPointages = ouvrierPointages.map((p) => ({
      date: p.date.toISOString().slice(0, 10),
      jours: Number(p.joursTravailles),
    }));
    const ouv = ouvriers.find((o) => o.id === selectedOuvrierId);
    calendarDefaultChantierId = ouv?.equipe?.chantier?.id ?? null;
  }

  const ouvriersWithPointage = ouvriers.map((o) => ({
    id: o.id,
    nom: o.nom,
    prenom: o.prenom,
    photo: o.photo,
    typeContrat: o.typeContrat,
    equipe: o.equipe
      ? {
          id: o.equipe.id,
          nom: o.equipe.nom,
          chantier: o.equipe.chantier ? { nom: o.equipe.chantier.nom } : null,
        }
      : null,
    pointageJours: o.pointages[0] ? Number(o.pointages[0].joursTravailles) : 0,
  }));

  const today = isoDate(new Date());
  const isToday = date === today;
  const formatted = dateObj.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Pour le mode "plage" : liste plate des ouvriers (avec leur équipe)
  const ouvriersForRange = ouvriers.map((o) => ({
    id: o.id,
    nom: o.nom,
    prenom: o.prenom,
    equipeNom: o.equipe?.nom ?? null,
    defaultChantierId: o.equipe?.chantier?.id ?? null,
  }));

  return (
    <div>
      <PageHeader
        title="Pointage"
        description={
          mode === "plage"
            ? "Saisie sur une plage de dates pour un ouvrier"
            : isToday
              ? "Aujourd'hui"
              : "Pointage du jour sélectionné"
        }
      />

      {/* Onglets : journée vs plage */}
      <div className="mb-4 flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit">
        <Link
          href={`/pointage?date=${date}`}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition",
            mode === "jour"
              ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
          )}
        >
          <Calendar size={14} /> Journée
        </Link>
        <Link
          href={`/pointage?mode=plage`}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition",
            mode === "plage"
              ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
          )}
        >
          <CalendarRange size={14} /> Plage de jours
        </Link>
      </div>

      {mode === "jour" && (
        <>
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 mb-4 flex items-center gap-2">
            <Link href={`/pointage?date=${shiftDate(date, -1)}`}>
              <Button variant="ghost" size="icon">
                <ChevronLeft size={18} />
              </Button>
            </Link>
            <div className="flex-1 flex items-center justify-center gap-2">
              <Calendar size={16} className="text-slate-500 dark:text-slate-500" />
              <DatePicker date={date} />
              <span className="hidden sm:inline text-sm text-slate-500 dark:text-slate-500 capitalize">
                {formatted}
              </span>
            </div>
            <Link href={`/pointage?date=${shiftDate(date, 1)}`}>
              <Button variant="ghost" size="icon">
                <ChevronRight size={18} />
              </Button>
            </Link>
            {!isToday && (
              <Link href={`/pointage?date=${today}`}>
                <Button variant="outline" size="sm">
                  Aujourd&apos;hui
                </Button>
              </Link>
            )}
          </div>

          {ouvriersWithPointage.length === 0 ? (
            <Card>
              <CardBody>
                <EmptyState
                  icon={Calendar}
                  title="Aucun ouvrier actif"
                  description="Crée des ouvriers actifs avant de pointer."
                  action={
                    <Link href="/ouvriers/nouveau">
                      <Button>Ajouter un ouvrier</Button>
                    </Link>
                  }
                />
              </CardBody>
            </Card>
          ) : (
            <PointageGrid
              key={date}
              ouvriers={ouvriersWithPointage}
              date={date}
              action={savePointage}
            />
          )}
        </>
      )}

      {mode === "plage" && (
        <Card>
          <CardHeader>
            <CardTitle>Calendrier de pointage</CardTitle>
          </CardHeader>
          <CardBody>
            {ouvriersForRange.length === 0 ? (
              <EmptyState
                icon={Calendar}
                title="Aucun ouvrier actif"
                description="Crée des ouvriers actifs avant de pointer."
              />
            ) : (
              <PointageCalendar
                key={`${selectedOuvrierId}-${year}-${monthIdx}`}
                ouvrierId={selectedOuvrierId}
                ouvriers={ouvriersForRange}
                chantiers={chantiers}
                initialPointages={calendarInitialPointages}
                defaultChantierId={calendarDefaultChantierId}
                year={year}
                monthIdx={monthIdx}
                basePath="/pointage"
                action={savePointageBatch}
              />
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
