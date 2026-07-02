import { redirect } from "next/navigation";
import { ShieldAlert, Filter } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";

const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Mappe les préfixes d'action vers une couleur de badge. */
function actionColor(
  action: string
): "red" | "orange" | "blue" | "green" | "slate" | "purple" {
  if (action.endsWith("_DELETED")) return "red";
  if (action.endsWith("_REVOKED")) return "red";
  if (action.startsWith("PAIEMENT_")) return "orange";
  if (action.includes("APPROUVEE") || action.includes("PAYE")) return "green";
  if (action.includes("REFUSEE")) return "red";
  if (action.startsWith("USER_")) return "blue";
  return "slate";
}

const PAGE_SIZE = 50;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; entity?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const action = sp.action || undefined;
  const entity = sp.entity || undefined;
  const page = Math.max(1, Number(sp.page) || 1);

  const where = {
    ...(action ? { action } : {}),
    ...(entity ? { entity } : {}),
  };

  const [entries, total, actions, entities] = await Promise.all([
    db.auditEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.auditEntry.count({ where }),
    // Pour les filtres : actions/entities distinctes utilisées
    db.auditEntry.findMany({
      select: { action: true },
      distinct: ["action"],
      orderBy: { action: "asc" },
    }),
    db.auditEntry.findMany({
      select: { entity: true },
      distinct: ["entity"],
      orderBy: { entity: "asc" },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <PageHeader
        backHref="/dashboard"
        title="Journal d'audit"
        description="Trace append-only des actions sensibles (paie, validations, rôles, suppressions). Lecture seule, ne peut pas être modifié."
      />

      {/* Filtres */}
      <Card>
        <CardBody>
          <form
            method="get"
            className="flex flex-wrap items-end gap-2 text-sm"
          >
            <label className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-0.5">
                Action
              </span>
              <select
                name="action"
                defaultValue={action ?? ""}
                className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm"
              >
                <option value="">Toutes</option>
                {actions.map((a) => (
                  <option key={a.action} value={a.action}>
                    {a.action}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-0.5">
                Entité
              </span>
              <select
                name="entity"
                defaultValue={entity ?? ""}
                className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm"
              >
                <option value="">Toutes</option>
                {entities.map((e) => (
                  <option key={e.entity} value={e.entity}>
                    {e.entity}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-brand-600 text-white text-sm hover:bg-brand-700"
            >
              <Filter size={14} /> Filtrer
            </button>
            {(action || entity) && (
              <Link
                href="/admin/audit"
                className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                Réinitialiser
              </Link>
            )}
            <div className="ml-auto text-xs text-slate-500 dark:text-slate-400">
              {total} entrée{total > 1 ? "s" : ""}
            </div>
          </form>
        </CardBody>
      </Card>

      {/* Liste */}
      <Card>
        <CardBody className="!p-0">
          {entries.length === 0 ? (
            <div className="p-10 text-center">
              <ShieldAlert
                size={32}
                className="mx-auto mb-3 text-slate-300 dark:text-slate-600"
              />
              <p className="text-sm text-slate-500 dark:text-slate-400 italic">
                Aucune action enregistrée pour ce filtre.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {entries.map((e) => (
                <li key={e.id} className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <Badge color={actionColor(e.action)}>{e.action}</Badge>
                    <span className="text-xs font-mono text-slate-400 dark:text-slate-500">
                      {e.entity}
                      {e.entityId ? `#${e.entityId.slice(0, 8)}` : ""}
                    </span>
                    <span className="ml-auto text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                      {dateTimeFmt.format(new Date(e.createdAt))}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-800 dark:text-slate-200">
                    {e.summary}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    par <span className="font-medium">{e.userName}</span>
                    {" · "}
                    <span className="uppercase">{e.userRole}</span>
                  </p>
                  {e.metadata !== null &&
                    typeof e.metadata === "object" && (
                      <details className="mt-1">
                        <summary className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200">
                          Détails techniques
                        </summary>
                        <pre className="mt-1 text-[10px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-2 rounded overflow-x-auto">
                          {JSON.stringify(e.metadata, null, 2)}
                        </pre>
                      </details>
                    )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <div className="text-slate-500 dark:text-slate-400">
            Page {page} / {totalPages}
          </div>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={{
                  pathname: "/admin/audit",
                  query: { ...(action ? { action } : {}), ...(entity ? { entity } : {}), page: page - 1 },
                }}
                className="px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                ← Précédente
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={{
                  pathname: "/admin/audit",
                  query: { ...(action ? { action } : {}), ...(entity ? { entity } : {}), page: page + 1 },
                }}
                className="px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Suivante →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
