import { redirect } from "next/navigation";
import { Trash2, FileText, ShoppingCart, ListTodo, Clock } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { TrashRow } from "./TrashRow";
import { autoPurgeExpired } from "./actions";

const RETENTION_DAYS = 30;

const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function daysRemaining(deletedAt: Date): number {
  const cutoff = new Date(deletedAt);
  cutoff.setDate(cutoff.getDate() + RETENTION_DAYS);
  const ms = cutoff.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

/**
 * Corbeille admin : liste les Tâches / Commandes / Rapports soft-deleted
 * sur les 30 derniers jours. Permet de restaurer ou purger
 * définitivement. Au-delà de 30 jours, l'entité est purgée
 * automatiquement à chaque chargement de cette page.
 */
export default async function CorbeillePage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/aujourdhui");

  // Purge auto au chargement (idempotente, légère)
  const { purged } = await autoPurgeExpired();

  const [taches, commandes, rapports] = await Promise.all([
    db.tache.findMany({
      where: { deletedAt: { not: null } },
      include: { chantier: { select: { nom: true } } },
      orderBy: { deletedAt: "desc" },
      take: 200,
    }),
    db.commande.findMany({
      where: { deletedAt: { not: null } },
      include: { chantier: { select: { nom: true } } },
      orderBy: { deletedAt: "desc" },
      take: 200,
    }),
    db.rapportChantier.findMany({
      where: { deletedAt: { not: null } },
      include: {
        chantier: { select: { nom: true } },
        author: { select: { name: true } },
      },
      orderBy: { deletedAt: "desc" },
      take: 200,
    }),
  ]);

  const total = taches.length + commandes.length + rapports.length;

  return (
    <div className="space-y-5">
      <PageHeader
        backHref="/accueil"
        title="Corbeille"
        description={`Éléments supprimés des 30 derniers jours — restauration possible, purge automatique au-delà.`}
      />

      {purged > 0 && (
        <div className="text-xs text-slate-500 dark:text-slate-400 italic">
          {purged} élément{purged > 1 ? "s" : ""} purgé
          {purged > 1 ? "s" : ""} automatiquement (au-delà de {RETENTION_DAYS}{" "}
          jours).
        </div>
      )}

      {total === 0 ? (
        <Card>
          <CardBody className="text-center py-10">
            <Trash2
              size={32}
              className="mx-auto mb-3 text-slate-300 dark:text-slate-600"
            />
            <p className="text-sm text-slate-500 dark:text-slate-400 italic">
              Aucun élément dans la corbeille.
            </p>
          </CardBody>
        </Card>
      ) : (
        <>
          {taches.length > 0 && (
            <Card>
              <CardBody>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
                  <ListTodo size={14} /> Tâches ({taches.length})
                </h3>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {taches.map((t) => (
                    <TrashRow
                      key={t.id}
                      entity="tache"
                      id={t.id}
                      title={t.nom}
                      subtitle={t.chantier?.nom ?? "—"}
                      deletedAtLabel={dateTimeFmt.format(new Date(t.deletedAt!))}
                      daysLeft={daysRemaining(t.deletedAt!)}
                    />
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          {commandes.length > 0 && (
            <Card>
              <CardBody>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
                  <ShoppingCart size={14} /> Commandes ({commandes.length})
                </h3>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {commandes.map((c) => (
                    <TrashRow
                      key={c.id}
                      entity="commande"
                      id={c.id}
                      title={`${c.fournisseur}${c.reference ? ` · ${c.reference}` : ""}`}
                      subtitle={`${c.chantier.nom} · ${Number(c.coutTotal).toFixed(2)} €`}
                      deletedAtLabel={dateTimeFmt.format(new Date(c.deletedAt!))}
                      daysLeft={daysRemaining(c.deletedAt!)}
                    />
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          {rapports.length > 0 && (
            <Card>
              <CardBody>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
                  <FileText size={14} /> Rapports ({rapports.length})
                </h3>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rapports.map((r) => (
                    <TrashRow
                      key={r.id}
                      entity="rapport"
                      id={r.id}
                      title={`Rapport du ${new Date(r.date).toLocaleDateString("fr-FR")}`}
                      subtitle={`${r.chantier.nom} · par ${r.author?.name ?? "?"}`}
                      deletedAtLabel={dateTimeFmt.format(new Date(r.deletedAt!))}
                      daysLeft={daysRemaining(r.deletedAt!)}
                    />
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </>
      )}

      <Card>
        <CardBody className="text-xs text-slate-600 dark:text-slate-400 space-y-2">
          <p className="flex items-center gap-2">
            <Clock size={12} /> Rétention : {RETENTION_DAYS} jours après la
            suppression.
          </p>
          <p>
            Au-delà, l&apos;élément est <strong>purgé automatiquement</strong>{" "}
            et n&apos;est plus récupérable. Les photos des rapports sont
            supprimées du disque à la purge.
          </p>
          <p>
            Les autres entités (chantiers, ouvriers, matériel, etc.) ne sont
            pas concernées par la corbeille — leur suppression reste immédiate
            et permanente.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
