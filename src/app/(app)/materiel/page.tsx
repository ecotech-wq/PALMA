import Link from "next/link";
import Image from "next/image";
import { Plus, Wrench, Search } from "lucide-react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { MaterielStatutBadge } from "./MaterielStatutBadge";

export default async function MaterielListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; statut?: string }>;
}) {
  const { q, statut } = await searchParams;

  const materiels = await db.materiel.findMany({
    where: {
      AND: [
        statut ? { statut: statut as never } : {},
        q
          ? {
              OR: [
                { nomCommun: { contains: q, mode: "insensitive" } },
                { marque: { contains: q, mode: "insensitive" } },
                { modele: { contains: q, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    },
    include: { _count: { select: { accessoires: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Matériel"
        description="Parc de l'entreprise + matériel loué/prêté"
        action={
          <Link href="/materiel/nouveau">
            <Button>
              <Plus size={16} />
              <span className="hidden sm:inline">Nouveau matériel</span>
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
            placeholder="Nom, marque, modèle..."
            className="pl-9"
          />
        </div>
        <select
          name="statut"
          defaultValue={statut ?? ""}
          className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm sm:w-44"
        >
          <option value="">Tous les statuts</option>
          <option value="DISPO">Disponible</option>
          <option value="SORTI">Sorti</option>
          <option value="EN_LOCATION">En location</option>
          <option value="HS">Hors service</option>
          <option value="PERDU">Perdu</option>
        </select>
        <Button type="submit" variant="secondary">Filtrer</Button>
      </form>

      {materiels.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="Aucun matériel"
          description="Ajoute ta visseuse, ta meuleuse, ton compresseur... avec photo et accessoires."
          action={
            <Link href="/materiel/nouveau">
              <Button>
                <Plus size={16} /> Ajouter mon premier matériel
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {materiels.map((m) => (
            <Link
              key={m.id}
              href={`/materiel/${m.id}`}
              className="group bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-brand-300 hover:shadow-sm transition overflow-hidden flex flex-col"
            >
              <div className="aspect-square bg-slate-100 dark:bg-slate-800 relative">
                {m.photo ? (
                  <Image
                    src={m.photo}
                    alt={m.nomCommun}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    className="object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-300">
                    <Wrench size={48} />
                  </div>
                )}
                <div className="absolute top-2 left-2">
                  <MaterielStatutBadge statut={m.statut} />
                </div>
              </div>
              <div className="p-3 flex-1">
                <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{m.nomCommun}</div>
                <div className="text-xs text-slate-500 dark:text-slate-500 mt-0.5 truncate">
                  {[m.marque, m.modele].filter(Boolean).join(" ") || "—"}
                </div>
                {m._count.accessoires > 0 && (
                  <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    {m._count.accessoires} accessoire{m._count.accessoires > 1 ? "s" : ""}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
