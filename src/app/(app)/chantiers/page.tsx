import Link from "next/link";
import { Plus, Hammer, MapPin, Search } from "lucide-react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { ChantierStatutBadge } from "./ChantierStatutBadge";
import { formatEuro, formatDate } from "@/lib/utils";
import { requireAuth } from "@/lib/auth-helpers";

export default async function ChantiersListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; statut?: string; archives?: string }>;
}) {
  const { q, statut, archives } = await searchParams;
  const showArchives = archives === "1";
  const me = await requireAuth();
  const accessibleIds = me.isClient
    ? (
        await db.user.findUnique({
          where: { id: me.id },
          select: { chantiersClient: { select: { id: true } } },
        })
      )?.chantiersClient.map((c) => c.id) ?? []
    : null;

  const chantiers = await db.chantier.findMany({
    where: {
      AND: [
        accessibleIds !== null ? { id: { in: accessibleIds } } : {},
        showArchives ? { archivedAt: { not: null } } : { archivedAt: null },
        statut ? { statut: statut as never } : {},
        q
          ? {
              OR: [
                { nom: { contains: q, mode: "insensitive" } },
                { adresse: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    },
    include: {
      _count: { select: { equipes: true } },
      chef: { select: { name: true } },
    },
    orderBy: [{ statut: "asc" }, { updatedAt: "desc" }],
  });

  const isFiltered = !!(q || statut || showArchives);

  return (
    <div>
      <PageHeader
        title={showArchives ? "Chantiers archivés" : "Chantiers"}
        description={
          me.isClient
            ? "Vos chantiers"
            : showArchives
              ? "Chantiers archivés (terminés et rangés)"
              : "Tous les chantiers de l'entreprise"
        }
        action={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {me.isAdmin && (
              <Link
                href={
                  showArchives ? "/chantiers" : "/chantiers?archives=1"
                }
              >
                <Button variant="outline" size="sm">
                  {showArchives ? "Voir les actifs" : "Voir les archives"}
                </Button>
              </Link>
            )}
            {me.isAdmin && !showArchives && (
              <Link href="/chantiers/nouveau">
                <Button>
                  <Plus size={16} />
                  <span className="hidden sm:inline">Nouveau chantier</span>
                  <span className="sm:hidden">Ajouter</span>
                </Button>
              </Link>
            )}
          </div>
        }
      />

      <form className="mb-4 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <Input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Nom, adresse, description..."
            className="pl-9"
          />
        </div>
        <select
          name="statut"
          defaultValue={statut ?? ""}
          className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 px-3 py-2 text-sm sm:w-44"
        >
          <option value="">Tous les statuts</option>
          <option value="PLANIFIE">Planifié</option>
          <option value="EN_COURS">En cours</option>
          <option value="PAUSE">En pause</option>
          <option value="TERMINE">Terminé</option>
          <option value="ANNULE">Annulé</option>
        </select>
        <Button type="submit" variant="secondary">
          Filtrer
        </Button>
        {isFiltered && (
          <Link href="/chantiers" className="text-sm text-slate-500 hover:underline self-center">
            Réinitialiser
          </Link>
        )}
      </form>

      {chantiers.length === 0 ? (
        <EmptyState
          icon={Hammer}
          title={isFiltered ? "Aucun chantier ne correspond" : "Aucun chantier"}
          description={
            isFiltered
              ? "Essaie de relâcher les filtres ou la recherche."
              : "Crée ton premier chantier pour commencer à y affecter des équipes, du matériel et un budget."
          }
          action={
            !isFiltered && (
              <Link href="/chantiers/nouveau">
                <Button>
                  <Plus size={16} /> Créer mon premier chantier
                </Button>
              </Link>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {chantiers.map((c) => {
            const budgetTotal = Number(c.budgetEspeces) + Number(c.budgetVirement);
            return (
              <Link
                key={c.id}
                href={`/chantiers/${c.id}`}
                className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-brand-300 dark:hover:border-brand-400 hover:shadow-sm transition p-4 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {c.nom}
                  </div>
                  <ChantierStatutBadge statut={c.statut} />
                </div>

                {c.adresse && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <MapPin size={12} />
                    <span className="truncate">{c.adresse}</span>
                  </div>
                )}

                <div className={`grid ${me.isAdmin ? "grid-cols-2" : "grid-cols-1"} gap-2 text-xs pt-2 border-t border-slate-100 dark:border-slate-800`}>
                  {me.isAdmin && (
                    <div>
                      <div className="text-slate-400 dark:text-slate-500">Budget</div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {formatEuro(budgetTotal)}
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="text-slate-400 dark:text-slate-500">Période</div>
                    <div className="font-medium text-slate-900 dark:text-slate-100 text-[11px]">
                      {formatDate(c.dateDebut)} → {formatDate(c.dateFin)}
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span>
                    {c._count.equipes} équipe{c._count.equipes > 1 ? "s" : ""}
                  </span>
                  <span className="truncate ml-2">{c.chef ? `Chef : ${c.chef.name}` : "—"}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
