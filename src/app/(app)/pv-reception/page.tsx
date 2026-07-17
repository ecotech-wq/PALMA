import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ClipboardCheck,
  ChevronRight,
  Hammer,
  AlertTriangle,
} from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import {
  requireAuth,
  getAccessibleChantierIds,
} from "@/lib/auth-helpers";

/**
 * Hub des PV de réception. Liste tous les chantiers et affiche pour
 * chacun l'état de son PV (brouillon, envoyé client, signé, levée des
 * réserves). Réservé au pilotage (nav pilotOnly) ; le client signe SON PV
 * depuis la fiche de son chantier, pas depuis ce hub.
 * Audit 2026-07-17 : l'ancienne garde « if (isChef) » laissait passer
 * OUVRIER et SOUS_TRAITANT (tous leurs flags à false). Le bon prédicat
 * est l'inverse du droit, jamais l'énumération des rôles interdits.
 */
export default async function PvReceptionHubPage() {
  const me = await requireAuth();
  if (!me.canPilot) redirect("/aujourdhui");
  const accessibleIds = await getAccessibleChantierIds(me);

  const chantiers = await db.chantier.findMany({
    where: {
      archivedAt: null,
      ...(accessibleIds !== null ? { id: { in: accessibleIds } } : {}),
    },
    select: {
      id: true,
      nom: true,
      adresse: true,
      statut: true,
      pvReceptions: {
        select: {
          statut: true,
          dateReception: true,
          _count: { select: { reserves: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  function pvBadge(st: string) {
    switch (st) {
      case "BROUILLON":
        return <Badge color="yellow">Brouillon</Badge>;
      case "ENVOYE_CLIENT":
        return <Badge color="blue">En attente du client</Badge>;
      case "SIGNE_CLIENT":
        return <Badge color="green">Signé client</Badge>;
      case "RESERVES_LEVEES":
        return <Badge color="green">Réserves levées</Badge>;
      default:
        return null;
    }
  }

  return (
    <div>
      <PageHeader
        title="PV de réception"
        description="Procès-verbaux de réception par chantier — signature client, gestion des réserves."
      />

      {chantiers.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={ClipboardCheck}
              title="Aucun chantier"
              description="Crée un chantier puis démarre son PV de réception quand les travaux sont prêts."
            />
          </CardBody>
        </Card>
      ) : (
        <ul className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
          {chantiers.map((c) => {
            const pv = c.pvReceptions[0];
            return (
              <li key={c.id}>
                <Link
                  href={`/chantiers/${c.id}/pv-reception`}
                  className="flex items-start gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
                >
                  <div className="shrink-0 w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 flex items-center justify-center">
                    <Hammer size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {c.nom}
                      </span>
                      {pv ? (
                        pvBadge(pv.statut)
                      ) : (
                        <Badge color="slate">Aucun PV</Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                      {pv ? (
                        <>
                          Réception : {new Date(pv.dateReception).toLocaleDateString("fr-FR")}
                          {pv._count.reserves > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-amber-700 dark:text-amber-400">
                              <AlertTriangle size={11} />
                              {pv._count.reserves} réserve
                              {pv._count.reserves > 1 ? "s" : ""}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="italic">Démarrer le PV de réception</span>
                      )}
                    </p>
                    {c.adresse && (
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                        {c.adresse}
                      </p>
                    )}
                  </div>
                  <ChevronRight
                    size={16}
                    className="shrink-0 text-slate-300 dark:text-slate-600 mt-2"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
