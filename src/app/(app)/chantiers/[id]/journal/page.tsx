import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { db } from "@/lib/db";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { redirect } from "next/navigation";
import {
  requireAuth,
  requireChantierAccess,
} from "@/lib/auth-helpers";
import { JournalTimeline } from "@/app/(app)/journal/JournalTimeline";

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shiftDay(date: string, days: number): string {
  const d = new Date(date + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + days);
  return isoDay(d);
}

export default async function JournalChantierPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { id } = await params;
  const me = await requireAuth();
  await requireChantierAccess(me, id);
  if (me.isClient && !me.visibility.showJournal) {
    redirect(`/chantiers/${id}`);
  }
  const { date: dateParam } = await searchParams;

  const date = dateParam || isoDay(new Date());
  const dayStart = new Date(date + "T00:00:00.000Z");
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const [chantier, messages] = await Promise.all([
    db.chantier.findUnique({
      where: { id },
      select: { id: true, nom: true },
    }),
    db.journalMessage.findMany({
      where: {
        chantierId: id,
        date: { gte: dayStart, lt: dayEnd },
      },
      include: {
        author: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!chantier) notFound();

  const today = isoDay(new Date());
  const isToday = date === today;

  return (
    <div>
      <PageHeader
        title={`Journal — ${chantier.nom}`}
        description={dateFmt.format(new Date(date + "T12:00:00.000Z"))}
        backHref={`/chantiers/${id}`}
      />

      {/* Navigation jour */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-2 mb-3 flex items-center gap-2">
        <Link href={`/chantiers/${id}/journal?date=${shiftDay(date, -1)}`}>
          <Button variant="ghost" size="icon">
            <ChevronLeft size={18} />
          </Button>
        </Link>
        <div className="flex-1 text-center text-sm font-semibold capitalize text-slate-900 dark:text-slate-100">
          <CalendarDays size={14} className="inline mr-1" />
          {dateFmt.format(new Date(date + "T12:00:00.000Z"))}
        </div>
        <Link href={`/chantiers/${id}/journal?date=${shiftDay(date, 1)}`}>
          <Button variant="ghost" size="icon">
            <ChevronRight size={18} />
          </Button>
        </Link>
        {!isToday && (
          <Link href={`/chantiers/${id}/journal?date=${today}`}>
            <Button variant="outline" size="sm">
              Aujourd&apos;hui
            </Button>
          </Link>
        )}
      </div>

      <Card>
        <CardBody className="!p-3 sm:!p-4">
          <JournalTimeline
            chantierId={id}
            date={date}
            currentUserId={me.id}
            isAdmin={me.isAdmin}
            isClient={me.isClient}
            messages={messages.map((m) => ({
              id: m.id,
              authorId: m.authorId,
              authorName: m.author?.name ?? null,
              authorRole: m.author?.role ?? null,
              type: m.type,
              texte: m.texte,
              photos: m.photos,
              videos: m.videos,
              hiddenFromClient: m.hiddenFromClient,
              incidentId: m.incidentId,
              demandeId: m.demandeId,
              commandeId: m.commandeId,
              createdAt: m.createdAt,
            }))}
          />
        </CardBody>
      </Card>
    </div>
  );
}
