import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MessageSquare, Timer, Trash2, Users, Wallet } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ChantierStatutBadge } from "../../chantiers/ChantierStatutBadge";
import { requireAuth, requireChantierAccess } from "@/lib/auth-helpers";
import { formatEuro } from "@/lib/utils";
import { Montant } from "@/features/discret";
import { PhaseForm } from "./PhaseForm";
import { supprimerPhase } from "../actions";

// ─── Pilotage d'une étude : phases d'honoraires, prévu / réel ───────────────

export default async function EtudePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await requireAuth();
  if (me.isClient) redirect("/dashboard");
  await requireChantierAccess(me, id);

  const etude = await db.chantier.findUnique({
    where: { id },
    include: {
      chef: { select: { name: true } },
      phasesEtude: { orderBy: { ordre: "asc" } },
      membres: { include: { user: { select: { id: true, name: true } } } },
    },
  });
  if (!etude || etude.type !== "ETUDE") notFound();

  // Réel : sommes par phase et par personne (requêtes groupées).
  const parPhase = await db.tempsPasse.groupBy({
    by: ["phaseId"],
    where: { chantierId: id },
    _sum: { heures: true },
  });
  const reelPhase = new Map(
    parPhase.map((s) => [s.phaseId ?? "hors", Number(s._sum.heures ?? 0)])
  );
  const parPersonne = await db.tempsPasse.groupBy({
    by: ["userId"],
    where: { chantierId: id },
    _sum: { heures: true },
  });
  const noms = new Map(
    (
      await db.user.findMany({
        where: { id: { in: parPersonne.map((p) => p.userId) } },
        select: { id: true, name: true },
      })
    ).map((u) => [u.id, u.name])
  );

  const totalVendu = etude.phasesEtude.reduce(
    (s, p) => s + Number(p.montantVendu),
    0
  );
  const totalBudgetH = etude.phasesEtude.reduce(
    (s, p) => s + Number(p.budgetHeures ?? 0),
    0
  );
  const totalReel = [...reelPhase.values()].reduce((s, h) => s + h, 0);

  return (
    <div>
      <PageHeader
        title={etude.nom}
        backHref="/be"
        description={etude.adresse ?? undefined}
        action={
          <div className="flex items-center gap-2">
            <ChantierStatutBadge statut={etude.statut} />
            <Link href={`/messagerie/${etude.id}`}>
              <Button variant="outline" size="sm">
                <MessageSquare size={14} />
                Messagerie
              </Button>
            </Link>
            <Link href={`/be/temps?etude=${etude.id}`}>
              <Button variant="outline" size="sm">
                <Timer size={14} />
                Saisir
              </Button>
            </Link>
            {me.canSeePrices && (
              <Link href={`/finance/${etude.id}`}>
                <Button variant="outline" size="sm">
                  <Wallet size={14} />
                  <span className="hidden sm:inline">Suivi financier</span>
                </Button>
              </Link>
            )}
          </div>
        }
      />

      {/* Synthèse : honoraires vendus, budget d'heures, réel */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">
              Honoraires vendus
            </p>
            <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
              {me.canSeePrices ? (
                <Montant>{formatEuro(totalVendu)}</Montant>
              ) : (
                "Masqué"
              )}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">
              Budget d'heures
            </p>
            <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
              {totalBudgetH.toLocaleString("fr-FR")} h
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">
              Heures passées
            </p>
            <p
              className={`mt-1 text-xl font-semibold ${
                totalBudgetH > 0 && totalReel > totalBudgetH
                  ? "text-red-600 dark:text-red-400"
                  : "text-slate-900 dark:text-slate-100"
              }`}
            >
              {totalReel.toLocaleString("fr-FR")} h
              {totalBudgetH > 0 && (
                <span className="ml-1 text-sm font-normal text-slate-500 dark:text-slate-400">
                  / {totalBudgetH.toLocaleString("fr-FR")} h
                </span>
              )}
            </p>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Phases d'honoraires */}
        <div className="lg:col-span-2">
          <Card>
            <CardBody>
              <h2 className="mb-3 text-sm font-medium text-slate-500 dark:text-slate-400">
                Phases d'honoraires
              </h2>
              {etude.phasesEtude.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Aucune phase : découpez l'étude (ESQ, APS, APD, PRO, DCE, EXE,
                  VISA, DET...) pour suivre le prévu contre le réel.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
                        <th className="py-2 pr-3">Phase</th>
                        {me.canSeePrices && (
                          <th className="py-2 pr-3 text-right">Vendu</th>
                        )}
                        <th className="py-2 pr-3 text-right">Budget h</th>
                        <th className="py-2 pr-3 text-right">Réel h</th>
                        <th className="py-2 pr-0 text-right" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {etude.phasesEtude.map((p) => {
                        // Ne capturer que l'id dans l'action en ligne (la
                        // ligne entière serait sérialisée dans le payload).
                        const phaseId = p.id;
                        const reel = reelPhase.get(p.id) ?? 0;
                        const budget = Number(p.budgetHeures ?? 0);
                        const depasse = budget > 0 && reel > budget;
                        return (
                          <tr key={p.id}>
                            <td className="py-2 pr-3">
                              <span className="font-medium text-slate-900 dark:text-slate-100">
                                {p.code}
                              </span>
                              <span className="ml-2 text-slate-500 dark:text-slate-400">
                                {p.libelle}
                              </span>
                            </td>
                            {me.canSeePrices && (
                              <td className="py-2 pr-3 text-right tabular-nums">
                                <Montant>{formatEuro(Number(p.montantVendu))}</Montant>
                              </td>
                            )}
                            <td className="py-2 pr-3 text-right tabular-nums">
                              {budget > 0
                                ? budget.toLocaleString("fr-FR")
                                : "–"}
                            </td>
                            <td
                              className={`py-2 pr-3 text-right tabular-nums ${
                                depasse
                                  ? "font-medium text-red-600 dark:text-red-400"
                                  : ""
                              }`}
                            >
                              {reel.toLocaleString("fr-FR")}
                            </td>
                            <td className="py-2 pr-0 text-right">
                              {me.canPilot && (
                                <form
                                  action={async () => {
                                    "use server";
                                    await supprimerPhase(phaseId);
                                  }}
                                  className="inline"
                                >
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    type="submit"
                                    aria-label="Supprimer la phase"
                                  >
                                    <Trash2 size={14} />
                                  </Button>
                                </form>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {(reelPhase.get("hors") ?? 0) > 0 && (
                        <tr>
                          <td className="py-2 pr-3 text-slate-500 dark:text-slate-400">
                            Hors phase
                          </td>
                          {me.canSeePrices && <td />}
                          <td className="py-2 pr-3 text-right">–</td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {(reelPhase.get("hors") ?? 0).toLocaleString("fr-FR")}
                          </td>
                          <td />
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {me.canPilot && (
                <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                  <PhaseForm chantierId={etude.id} canSeePrices={me.canSeePrices} />
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Réel par personne + membres */}
        <div className="space-y-4">
          <Card>
            <CardBody>
              <h2 className="mb-3 text-sm font-medium text-slate-500 dark:text-slate-400">
                Heures par personne
              </h2>
              {parPersonne.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Aucune heure saisie.
                </p>
              ) : (
                <ul className="space-y-2">
                  {parPersonne
                    .sort(
                      (a, b) =>
                        Number(b._sum.heures ?? 0) - Number(a._sum.heures ?? 0)
                    )
                    .map((p) => (
                      <li
                        key={p.userId}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-slate-700 dark:text-slate-300">
                          {noms.get(p.userId) ?? "?"}
                        </span>
                        <span className="tabular-nums font-medium text-slate-900 dark:text-slate-100">
                          {Number(p._sum.heures ?? 0).toLocaleString("fr-FR")} h
                        </span>
                      </li>
                    ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-400">
                <Users size={14} />
                Membres ({etude.membres.length})
              </h2>
              <ul className="space-y-1">
                {etude.membres.map((m) => (
                  <li
                    key={m.id}
                    className="text-sm text-slate-700 dark:text-slate-300"
                  >
                    {m.user.name}
                  </li>
                ))}
                {etude.membres.length === 0 && (
                  <li className="text-sm text-slate-500 dark:text-slate-400">
                    Ajoutez les membres depuis la messagerie de l'étude.
                  </li>
                )}
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
