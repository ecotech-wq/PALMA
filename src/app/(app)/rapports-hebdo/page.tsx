import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarRange, ChevronRight, Hammer } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import {
  requireAuth,
  getAccessibleChantierIds,
} from "@/lib/auth-helpers";

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

/**
 * Hub des rapports hebdomadaires. Liste tous les chantiers accessibles
 * et permet d'aller au rapport hebdo de chacun. Affiche l'état du
 * dernier rapport (brouillon / envoyé / signé client).
 */
export default async function RapportsHebdoHubPage() {
  const me = await requireAuth();
  if (me.isClient && !me.visibility.showRapportsHebdo) {
    redirect("/dashboard");
  }
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
      rapportsHebdo: {
        select: {
          semaineDebut: true,
          envoyeAuClient: true,
          envoyeLe: true,
          signatureClientLe: true,
        },
        orderBy: { semaineDebut: "desc" },
        take: 1,
      },
      _count: { select: { rapportsHebdo: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Rapports hebdo"
        description="Synthèse hebdomadaire envoyée au client — un rapport par chantier par semaine."
      />

      {chantiers.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={CalendarRange}
              title="Aucun chantier"
              description="Crée un chantier pour démarrer les rapports hebdo."
            />
          </CardBody>
        </Card>
      ) : (
        <ul className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
          {chantiers.map((c) => {
            const last = c.rapportsHebdo[0];
            return (
              <li key={c.id}>
                <Link
                  href={`/chantiers/${c.id}/rapport-hebdo`}
                  className="flex items-start gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
                >
                  <div className="shrink-0 w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
                    <Hammer size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {c.nom}
                      </span>
                      {last?.signatureClientLe ? (
                        <Badge color="green">Signé client</Badge>
                      ) : last?.envoyeAuClient ? (
                        <Badge color="blue">Envoyé</Badge>
                      ) : last ? (
                        <Badge color="yellow">Brouillon</Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {last
                        ? `Dernier rapport : semaine du ${dateFmt.format(new Date(last.semaineDebut))}`
                        : "Aucun rapport hebdo encore créé"}
                      {c._count.rapportsHebdo > 1 &&
                        ` · ${c._count.rapportsHebdo} rapports au total`}
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
