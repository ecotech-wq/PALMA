import Link from "next/link";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { PointageGrid } from "./PointageGrid";
import { DatePicker } from "./DatePicker";
import { savePointage } from "./actions";

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
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: dateParam } = await searchParams;
  const date = dateParam || isoDate(new Date());
  const dateObj = new Date(date);
  const dayDate = new Date(date + "T00:00:00.000Z");

  const ouvriers = await db.ouvrier.findMany({
    where: { actif: true },
    include: {
      equipe: { include: { chantier: { select: { nom: true } } } },
      pointages: { where: { date: dayDate }, take: 1 },
    },
    orderBy: [{ equipeId: "asc" }, { nom: "asc" }],
  });

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

  return (
    <div>
      <PageHeader
        title="Pointage"
        description={isToday ? "Aujourd'hui" : "Pointage du jour sélectionné"}
      />

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 mb-4 flex items-center gap-2">
        <Link href={`/pointage?date=${shiftDate(date, -1)}`}>
          <Button variant="ghost" size="icon">
            <ChevronLeft size={18} />
          </Button>
        </Link>
        <div className="flex-1 flex items-center justify-center gap-2">
          <Calendar size={16} className="text-slate-500 dark:text-slate-500" />
          <DatePicker date={date} />
          <span className="hidden sm:inline text-sm text-slate-500 dark:text-slate-500 capitalize">{formatted}</span>
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
    </div>
  );
}
