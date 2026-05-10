import Link from "next/link";
import { Plus, AlertTriangle, Search, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { requireAuth, getAccessibleChantierIds } from "@/lib/auth-helpers";
import {
  GraviteBadge,
  StatutBadge,
  categorieLabel,
} from "./IncidentBadges";

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function IncidentsListPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    statut?: string;
    chantier?: string;
    gravite?: string;
  }>;
}) {
  const me = await requireAuth();
  if (me.isClient && !me.visibility.showIncidents) {
    const { redirect } = await import("next/navigation");
    redirect("/dashboard");
  }
  const accessibleIds = await getAccessibleChantierIds(me);
  const { q, statut, chantier, gravite } = await searchParams;

  const where: {
    statut?: "OUVERT" | "EN_COURS" | "RESOLU";
    chantierId?: string | { in: string[] };
    gravite?: "INFO" | "ATTENTION" | "URGENT";
    OR?: {
      titre?: { contains: string; mode: "insensitive" };
      description?: { contains: string; mode: "insensitive" };
    }[];
  } = {};
  if (accessibleIds !== null) {
    where.chantierId = { in: accessibleIds };
  }
  if (statut && ["OUVERT", "EN_COURS", "RESOLU"].includes(statut)) {
    where.statut = statut as "OUVERT" | "EN_COURS" | "RESOLU";
  }
  if (chantier) where.chantierId = chantier;
  if (gravite && ["INFO", "ATTENTION", "URGENT"].includes(gravite)) {
    where.gravite = gravite as "INFO" | "ATTENTION" | "URGENT";
  }
  if (q && q.trim().length > 0) {
    where.OR = [
      { titre: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }

  const [incidents, chantiers, counts] = await Promise.all([
    db.incident.findMany({
      where,
      include: {
        chantier: { select: { id: true, nom: true } },
        reporter: { select: { name: true } },
      },
      orderBy: [{ statut: "asc" }, { gravite: "desc" }, { createdAt: "desc" }],
      take: 100,
    }),
    db.chantier.findMany({
      where: accessibleIds !== null ? { id: { in: accessibleIds } } : {},
      select: { id: true, nom: true },
      orderBy: { nom: "asc" },
    }),
    db.incident.groupBy({
      by: ["statut"],
      where: accessibleIds !== null ? { chantierId: { in: accessibleIds } } : {},
      _count: true,
    }),
  ]);

  const ouvertCount = counts.find((c) => c.statut === "OUVERT")?._count ?? 0;
  const enCoursCount = counts.find((c) => c.statut === "EN_COURS")?._count ?? 0;
  const resoluCount = counts.find((c) => c.statut === "RESOLU")?._count ?? 0;

  return (
    <div>
      <PageHeader
        title="Incidents"
        description="Problèmes terrain remontés par les chefs de chantier"
        action={
          !me.isClient && (
            <Link href="/incidents/nouveau">
              <Button>
                <Plus size={16} />
                <span className="hidden sm:inline">Signaler un incident</span>
                <span className="sm:hidden">Signaler</span>
              </Button>
            </Link>
          )
        }
      />

      {/* Stats rapides */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <StatLink
          href="/incidents?statut=OUVERT"
          label="Ouverts"
          value={ouvertCount}
          color="yellow"
          active={statut === "OUVERT"}
        />
        <StatLink
          href="/incidents?statut=EN_COURS"
          label="En cours"
          value={enCoursCount}
          color="blue"
          active={statut === "EN_COURS"}
        />
        <StatLink
          href="/incidents?statut=RESOLU"
          label="Résolus"
          value={resoluCount}
          color="green"
          active={statut === "RESOLU"}
        />
      </div>

      {/* Filtres */}
      <form className="mb-4 grid grid-cols-1 sm:grid-cols-12 gap-2">
        <div className="relative sm:col-span-5">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
          />
          <Input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Titre, description..."
            className="pl-9"
          />
        </div>
        <select
          name="chantier"
          defaultValue={chantier ?? ""}
          className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm sm:col-span-3"
        >
          <option value="">Tous chantiers</option>
          {chantiers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </select>
        <select
          name="gravite"
          defaultValue={gravite ?? ""}
          className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm sm:col-span-2"
        >
          <option value="">Toutes gravités</option>
          <option value="URGENT">Urgent</option>
          <option value="ATTENTION">Attention</option>
          <option value="INFO">Info</option>
        </select>
        <input type="hidden" name="statut" value={statut ?? ""} />
        <Button type="submit" variant="secondary" className="sm:col-span-2">
          Filtrer
        </Button>
      </form>

      {incidents.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={AlertTriangle}
              title="Aucun incident"
              description="Quand quelque chose bloque sur le terrain (panne, livraison ratée, météo, accident), signalez-le ici."
              action={
                <Link href="/incidents/nouveau">
                  <Button>
                    <Plus size={16} /> Signaler un incident
                  </Button>
                </Link>
              }
            />
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody className="!p-0">
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {incidents.map((i) => (
                <li key={i.id}>
                  <Link
                    href={`/incidents/${i.id}`}
                    className="flex items-start gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-900 transition"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                          {i.titre}
                        </span>
                        <StatutBadge statut={i.statut} />
                        <GraviteBadge gravite={i.gravite} />
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span>{categorieLabel[i.categorie]}</span>
                        {i.chantier && (
                          <>
                            <span>·</span>
                            <span className="text-brand-700 dark:text-brand-400">
                              {i.chantier.nom}
                            </span>
                          </>
                        )}
                        <span>·</span>
                        <span>{dateFmt.format(new Date(i.createdAt))}</span>
                        <span>·</span>
                        <span>par {i.reporter.name}</span>
                      </div>
                    </div>
                    {i.photos.length > 0 && (
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 shrink-0">
                        📷 {i.photos.length}
                      </span>
                    )}
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
      )}
    </div>
  );
}

function StatLink({
  href,
  label,
  value,
  color,
  active,
}: {
  href: string;
  label: string;
  value: number;
  color: "yellow" | "blue" | "green";
  active: boolean;
}) {
  const colorMap = {
    yellow:
      "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900",
    blue: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900",
    green:
      "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 border-green-200 dark:border-green-900",
  };
  return (
    <Link
      href={href}
      className={`rounded-lg border p-3 ${colorMap[color]} ${active ? "ring-2 ring-offset-2 ring-current dark:ring-offset-slate-950" : ""}`}
    >
      <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</div>
    </Link>
  );
}
