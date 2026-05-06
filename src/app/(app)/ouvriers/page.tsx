import Link from "next/link";
import Image from "next/image";
import { Plus, User, Phone, Search } from "lucide-react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { formatEuro } from "@/lib/utils";

const contratLabel: Record<string, string> = {
  FIXE: "Fixe",
  JOUR: "Journalier",
  SEMAINE: "Hebdo",
  MOIS: "Au mois",
  FORFAIT: "Forfait",
};

const tarifSuffix: Record<string, string> = {
  FIXE: "/mois",
  MOIS: "/mois",
  SEMAINE: "/sem",
  JOUR: "/jour",
  FORFAIT: " forfait",
};

export default async function OuvriersListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; contrat?: string; actif?: string }>;
}) {
  const { q, contrat, actif } = await searchParams;

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
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {ouvriers.map((o) => {
              const fullName = [o.prenom, o.nom].filter(Boolean).join(" ");
              return (
                <li key={o.id}>
                  <Link
                    href={`/ouvriers/${o.id}`}
                    className="flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-900 transition"
                  >
                    <div className="w-12 h-12 shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden relative">
                      {o.photo ? (
                        <Image src={o.photo} alt={fullName} fill sizes="48px" className="object-cover" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-slate-400 dark:text-slate-500">
                          <User size={20} />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900 dark:text-slate-100 truncate">{fullName}</span>
                        {!o.actif && <Badge color="slate">Inactif</Badge>}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-500 mt-0.5">
                        {o.telephone && (
                          <span className="flex items-center gap-1">
                            <Phone size={11} /> {o.telephone}
                          </span>
                        )}
                        {o.equipe && <span>· {o.equipe.nom}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge color="blue">{contratLabel[o.typeContrat]}</Badge>
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100 mt-1">
                        {formatEuro(o.tarifBase.toString())}
                        <span className="text-xs font-normal text-slate-500 dark:text-slate-500">
                          {tarifSuffix[o.typeContrat]}
                        </span>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
