import { redirect } from "next/navigation";
import { Timer, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { requireAuth, getAccessibleChantierIds } from "@/lib/auth-helpers";
import { formatDate } from "@/lib/utils";
import { TempsForm } from "./TempsForm";
import { supprimerTemps } from "../actions";

// ─── Mes temps : saisie de la veille + mes 14 derniers jours ────────────────

export default async function MesTempsPage({
  searchParams,
}: {
  searchParams: Promise<{ etude?: string }>;
}) {
  const { etude } = await searchParams;
  const me = await requireAuth();
  if (me.isClient) redirect("/dashboard");

  const accessibles = await getAccessibleChantierIds(me);
  const etudes = await db.chantier.findMany({
    where: {
      AND: [
        { type: "ETUDE" },
        { archivedAt: null },
        accessibles !== null ? { id: { in: accessibles } } : {},
      ],
    },
    select: {
      id: true,
      nom: true,
      phasesEtude: {
        select: { id: true, code: true, libelle: true },
        orderBy: { ordre: "asc" },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const depuis = new Date();
  depuis.setDate(depuis.getDate() - 14);
  const mesLignes = await db.tempsPasse.findMany({
    where: { userId: me.id, date: { gte: depuis } },
    include: {
      chantier: { select: { nom: true } },
      phase: { select: { code: true } },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 40,
  });

  const totalSemaine = mesLignes
    .filter((l) => {
      const j = new Date();
      j.setDate(j.getDate() - 7);
      return l.date >= j;
    })
    .reduce((s, l) => s + Number(l.heures), 0);

  // La veille par défaut : on saisit le réalisé d'hier au stand-up du matin.
  const hier = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);

  return (
    <div>
      <PageHeader
        title="Mes temps"
        description={`Saisie du réalisé par étude. 7 derniers jours : ${totalSemaine.toLocaleString("fr-FR")} h.`}
      />

      {etudes.length === 0 ? (
        <EmptyState
          icon={Timer}
          title="Aucune étude accessible"
          description="Demandez à être ajouté comme membre d'une étude, ou créez-en une depuis l'onglet Études."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardBody>
              <TempsForm
                etudes={etudes.map((e) => ({
                  id: e.id,
                  nom: e.nom,
                  phases: e.phasesEtude,
                }))}
                etudeInitiale={etude}
                dateInitiale={hier}
              />
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <h2 className="mb-3 text-sm font-medium text-slate-500 dark:text-slate-400">
                Mes 14 derniers jours
              </h2>
              {mesLignes.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Aucune saisie pour l'instant.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {mesLignes.map((l) => (
                    <li key={l.id} className="flex items-center gap-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-slate-900 dark:text-slate-100">
                          <span className="font-medium">
                            {Number(l.heures).toLocaleString("fr-FR")} h
                          </span>
                          {" · "}
                          {l.chantier.nom}
                          {l.phase ? ` · ${l.phase.code}` : ""}
                        </p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {formatDate(l.date)}
                          {l.note ? ` · ${l.note}` : ""}
                        </p>
                      </div>
                      <form
                        action={async () => {
                          "use server";
                          await supprimerTemps(l.id);
                        }}
                      >
                        <Button variant="ghost" size="icon" type="submit" aria-label="Supprimer">
                          <Trash2 size={14} />
                        </Button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
