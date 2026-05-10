import Link from "next/link";
import { Plus, User, Search } from "lucide-react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { OuvriersBulkList } from "./OuvriersBulkList";
import { requireAuth } from "@/lib/auth-helpers";

export default async function OuvriersListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; contrat?: string; actif?: string }>;
}) {
  const { q, contrat, actif } = await searchParams;
  const me = await requireAuth();

  const ouvriers = await db.ouvrier.findMany({
    where: {
      AND: [
        actif === "actifs" ? { actif: true } : actif === "inactifs" ? { actif: false } : {},
        contrat ? { typeContrat: contrat as never } : {},
        q
          ? {
              OR: [
                { nom: { contains: q, mode: "insensitive" } },
                { prenom: { contains: q, mode: "insensitive" } },
                { telephone: { contains: q, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    },
    include: { equipe: { select: { nom: true } } },
    orderBy: [{ actif: "desc" }, { nom: "asc" }],
  });

  const isFiltered = !!(q || contrat || actif);

  return (
    <div>
      <PageHeader
        title="Ouvriers"
        description="Tous les ouvriers et leur contrat"
        action={
          <Link href="/ouvriers/nouveau">
            <Button>
              <Plus size={16} />
              <span className="hidden sm:inline">Nouvel ouvrier</span>
              <span className="sm:hidden">Ajouter</span>
            </Button>
          </Link>
        }
      />

      <form className="mb-4 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <Input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Nom, prénom, téléphone..."
            className="pl-9"
          />
        </div>
        <select
          name="contrat"
          defaultValue={contrat ?? ""}
          className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 px-3 py-2 text-sm sm:w-40"
        >
          <option value="">Tous contrats</option>
          <option value="FIXE">Fixe</option>
          <option value="MOIS">Au mois</option>
          <option value="SEMAINE">À la semaine</option>
          <option value="JOUR">À la journée</option>
          <option value="FORFAIT">Forfait</option>
        </select>
        <select
          name="actif"
          defaultValue={actif ?? ""}
          className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 px-3 py-2 text-sm sm:w-32"
        >
          <option value="">Tous</option>
          <option value="actifs">Actifs</option>
          <option value="inactifs">Inactifs</option>
        </select>
        <Button type="submit" variant="secondary">
          Filtrer
        </Button>
        {isFiltered && (
          <Link href="/ouvriers" className="text-sm text-slate-500 hover:underline self-center">
            Réinitialiser
          </Link>
        )}
      </form>

      {ouvriers.length === 0 ? (
        <EmptyState
          icon={User}
          title="Aucun ouvrier"
          description="Ajoute tes ouvriers avec leur type de contrat (fixe, jour, semaine, mois, forfait) et leur tarif."
          action={
            <Link href="/ouvriers/nouveau">
              <Button>
                <Plus size={16} /> Ajouter mon premier ouvrier
              </Button>
            </Link>
          }
        />
      ) : (
        <OuvriersBulkList
          isAdmin={me.isAdmin}
          ouvriers={ouvriers.map((o) => ({
            id: o.id,
            nom: o.nom,
            prenom: o.prenom,
            photo: o.photo,
            telephone: o.telephone,
            typeContrat: o.typeContrat,
            tarifBase: String(o.tarifBase),
            actif: o.actif,
            equipeNom: o.equipe?.nom ?? null,
          }))}
        />
      )}
    </div>
  );
}
