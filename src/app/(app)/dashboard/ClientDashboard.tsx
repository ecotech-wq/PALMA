import Link from "next/link";
import {
  Hammer,
  FileText,
  AlertTriangle,
  CheckCircle2,
  CalendarRange,
  ChevronRight,
} from "lucide-react";
import { db } from "@/lib/db";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ChantierStatutBadge } from "@/app/(app)/chantiers/ChantierStatutBadge";

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

/**
 * Dashboard minimal pour un client : ne voit QUE ses chantiers, pas
 * de stats globales, pas de finances. Liste les chantiers assignés
 * et les derniers rapports / incidents qui concernent ces chantiers.
 */
export async function ClientDashboard({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}) {
  // Récupère les chantiers assignés au client
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      chantiersClient: {
        select: {
          id: true,
          nom: true,
          adresse: true,
          statut: true,
          dateDebut: true,
          dateFin: true,
        },
        orderBy: { nom: "asc" },
      },
    },
  });

  const chantiers = user?.chantiersClient ?? [];
  const chantierIds = chantiers.map((c) => c.id);

  // Charge en parallèle les derniers rapports hebdo envoyés, les
  // incidents non résolus, les rapports journaliers récents
  const [rapportsHebdoRecents, incidents, journauxRecents] = await Promise.all([
    chantierIds.length > 0
      ? db.rapportHebdo.findMany({
          where: {
            chantierId: { in: chantierIds },
            envoyeAuClient: true,
          },
          include: { chantier: { select: { id: true, nom: true } } },
          orderBy: { semaineDebut: "desc" },
          take: 5,
        })
      : [],
    chantierIds.length > 0
      ? db.incident.findMany({
          where: {
            chantierId: { in: chantierIds },
            statut: { in: ["OUVERT", "EN_COURS"] },
          },
          include: { chantier: { select: { id: true, nom: true } } },
          orderBy: { createdAt: "desc" },
          take: 5,
        })
      : [],
    chantierIds.length > 0
      ? db.journalMessage.findMany({
          where: {
            chantierId: { in: chantierIds },
            hiddenFromClient: false,
            type: { in: ["NOTE", "BILAN_JOURNEE"] },
          },
          include: { chantier: { select: { id: true, nom: true } } },
          orderBy: { createdAt: "desc" },
          take: 8,
        })
      : [],
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Bonjour {userName}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {chantiers.length === 0
            ? "Aucun chantier ne vous est encore associé."
            : `Vous avez accès à ${chantiers.length} chantier${chantiers.length > 1 ? "s" : ""}.`}
        </p>
      </div>

      {chantiers.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={Hammer}
              title="Aucun chantier"
              description="Votre administrateur ne vous a pas encore donné accès à un chantier. Contactez-le pour qu'il vous en assigne."
            />
          </CardBody>
        </Card>
      ) : (
        <>
          {/* Liste des chantiers */}
          <Card>
            <CardHeader>
              <CardTitle>Mes chantiers</CardTitle>
            </CardHeader>
            <CardBody className="!p-0">
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {chantiers.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/chantiers/${c.id}`}
                      className="flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-900 transition"
                    >
                      <Hammer
                        size={18}
                        className="text-brand-600 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                            {c.nom}
                          </span>
                          <ChantierStatutBadge statut={c.statut} />
                        </div>
                        {c.adresse && (
                          <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {c.adresse}
                          </div>
                        )}
                        {(c.dateDebut || c.dateFin) && (
                          <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                            {c.dateDebut ? dateFmt.format(c.dateDebut) : "?"}{" "}
                            → {c.dateFin ? dateFmt.format(c.dateFin) : "?"}
                          </div>
                        )}
                      </div>
                      <ChevronRight
                        size={16}
                        className="text-slate-300 dark:text-slate-600 shrink-0"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          {/* Rapports hebdomadaires récents */}
          {rapportsHebdoRecents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarRange size={18} />
                  Rapports hebdomadaires reçus
                </CardTitle>
              </CardHeader>
              <CardBody className="!p-0">
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rapportsHebdoRecents.map((r) => {
                    const semaineDebutStr = r.semaineDebut
                      .toISOString()
                      .slice(0, 10);
                    return (
                      <li key={r.id}>
                        <Link
                          href={`/chantiers/${r.chantier.id}/rapport-hebdo?w=${semaineDebutStr}`}
                          className="flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-900 transition"
                        >
                          <FileText
                            size={16}
                            className="text-brand-600 shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-slate-900 dark:text-slate-100 truncate text-sm">
                              {r.chantier.nom}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              Semaine du {dateFmt.format(r.semaineDebut)}
                              {r.envoyeLe &&
                                ` · reçu le ${dateFmt.format(r.envoyeLe)}`}
                            </div>
                          </div>
                          <ChevronRight
                            size={14}
                            className="text-slate-300 dark:text-slate-600"
                          />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </CardBody>
            </Card>
          )}

          {/* Incidents en cours */}
          {incidents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle size={18} className="text-amber-600" />
                  Incidents en cours
                </CardTitle>
              </CardHeader>
              <CardBody className="!p-0">
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {incidents.map((i) => (
                    <li key={i.id}>
                      <Link
                        href={`/incidents/${i.id}`}
                        className="flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-900 transition"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-900 dark:text-slate-100 truncate text-sm">
                            {i.titre}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {i.chantier?.nom ?? "—"} ·{" "}
                            {dateFmt.format(i.createdAt)}
                          </div>
                        </div>
                        <ChevronRight
                          size={14}
                          className="text-slate-300 dark:text-slate-600"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          {/* Activité récente du journal */}
          {journauxRecents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 size={18} className="text-green-600" />
                  Activité récente
                </CardTitle>
              </CardHeader>
              <CardBody className="!p-0">
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {journauxRecents.map((j) => (
                    <li key={j.id}>
                      <Link
                        href={`/chantiers/${j.chantier.id}/journal?date=${j.date.toISOString().slice(0, 10)}`}
                        className="flex items-start gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-900 transition"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-900 dark:text-slate-100 truncate text-sm">
                            {j.chantier.nom}
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                            {j.texte ?? "[média]"}
                          </div>
                          <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                            {dateFmt.format(j.createdAt)}
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
