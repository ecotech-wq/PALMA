import Link from "next/link";
import Image from "next/image";
import {
  FileText,
  Sun,
  Cloud,
  CloudRain,
  CloudLightning,
  Snowflake,
  Wind,
  Users,
  Search,
  Plus,
} from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { requireAuth, getAccessibleChantierIds } from "@/lib/auth-helpers";

const meteoIconMap = {
  SOLEIL: { Icon: Sun, color: "text-yellow-600" },
  NUAGEUX: { Icon: Cloud, color: "text-slate-500" },
  PLUIE: { Icon: CloudRain, color: "text-blue-500" },
  ORAGE: { Icon: CloudLightning, color: "text-amber-600" },
  NEIGE: { Icon: Snowflake, color: "text-cyan-500" },
  GEL: { Icon: Snowflake, color: "text-cyan-700" },
  VENT_FORT: { Icon: Wind, color: "text-slate-600" },
} as const;

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default async function RapportsListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; chantier?: string }>;
}) {
  const me = await requireAuth();
  if (me.isClient && !me.visibility.showJournal) {
    const { redirect } = await import("next/navigation");
    redirect("/dashboard");
  }
  const accessibleIds = await getAccessibleChantierIds(me);
  const { q, chantier } = await searchParams;

  const [rapports, chantiers] = await Promise.all([
    db.rapportChantier.findMany({
      where: {
        ...(accessibleIds !== null
          ? { chantierId: { in: accessibleIds } }
          : {}),
        ...(chantier ? { chantierId: chantier } : {}),
        ...(q && q.trim().length > 0
          ? { texte: { contains: q, mode: "insensitive" } }
          : {}),
      },
      include: {
        chantier: { select: { id: true, nom: true } },
        author: { select: { id: true, name: true } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 100,
    }),
    db.chantier.findMany({
      where: accessibleIds !== null ? { id: { in: accessibleIds } } : {},
      select: { id: true, nom: true },
      orderBy: { nom: "asc" },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Rapports de chantier"
        description="Compte-rendus journaliers postés par les chefs"
        action={
          !me.isClient && (
            <Link href="/rapports/nouveau">
              <Button>
                <Plus size={16} />
                <span className="hidden sm:inline">Nouveau rapport</span>
                <span className="sm:hidden">Nouveau</span>
              </Button>
            </Link>
          )
        }
      />

      {/* Filtres */}
      <form className="mb-4 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
          />
          <Input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Rechercher dans les rapports..."
            className="pl-9"
          />
        </div>
        <select
          name="chantier"
          defaultValue={chantier ?? ""}
          className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 px-3 py-2 text-sm sm:w-56"
        >
          <option value="">Tous les chantiers</option>
          {chantiers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary">
          Filtrer
        </Button>
      </form>

      {rapports.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={FileText}
              title="Aucun rapport"
              description={
                q || chantier
                  ? "Essaie de relâcher les filtres."
                  : "Les chefs de chantier publient leurs rapports journaliers depuis la fiche d'un chantier."
              }
            />
          </CardBody>
        </Card>
      ) : (
        <ul className="space-y-3">
          {rapports.map((r) => {
            const meteo = r.meteo ? meteoIconMap[r.meteo] : null;
            return (
              <li
                key={r.id}
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:p-4"
              >
                <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/chantiers/${r.chantier.id}#rapport-${r.id}`}
                      className="font-semibold text-brand-700 dark:text-brand-400 hover:underline"
                    >
                      {r.chantier.nom}
                    </Link>
                    <span className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                      · {dateFmt.format(new Date(r.date))}
                    </span>
                    {meteo && (
                      <meteo.Icon size={14} className={meteo.color} />
                    )}
                    {r.nbOuvriers !== null && r.nbOuvriers > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                        <Users size={12} /> {r.nbOuvriers}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">
                    {r.author.name}
                  </span>
                </div>
                <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words line-clamp-4">
                  {r.texte}
                </div>
                {r.photos.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {r.photos.slice(0, 6).map((url, idx) => (
                      <Link
                        key={url}
                        href={`/chantiers/${r.chantier.id}#rapport-${r.id}`}
                        className="relative w-14 h-14 rounded overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800"
                      >
                        <Image
                          src={url}
                          alt={`Photo ${idx + 1}`}
                          fill
                          sizes="56px"
                          className="object-cover"
                        />
                      </Link>
                    ))}
                    {r.photos.length > 6 && (
                      <span className="inline-flex items-center justify-center w-14 h-14 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-xs text-slate-500">
                        +{r.photos.length - 6}
                      </span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
