import Link from "next/link";
import Image from "next/image";
import { Plus, Wrench, ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Input";
import { formatDate } from "@/lib/utils";
import { cloturerSortie } from "./actions";

const etatLabel: Record<string, string> = {
  BON: "Bon état",
  USE: "Usé",
  CASSE: "Cassé",
  MANQUANT: "Manquant",
};

const etatColor: Record<string, "green" | "yellow" | "red" | "slate"> = {
  BON: "green",
  USE: "yellow",
  CASSE: "red",
  MANQUANT: "slate",
};

export default async function SortiesPage() {
  const [sortiesActives, sortiesCloturees] = await Promise.all([
    db.sortieMateriel.findMany({
      where: { dateRetour: null },
      include: {
        materiel: { select: { id: true, nomCommun: true, marque: true, modele: true, photo: true } },
        equipe: { select: { id: true, nom: true } },
        chantier: { select: { id: true, nom: true } },
      },
      orderBy: { dateSortie: "desc" },
    }),
    db.sortieMateriel.findMany({
      where: { dateRetour: { not: null } },
      include: {
        materiel: { select: { id: true, nomCommun: true, photo: true } },
        equipe: { select: { id: true, nom: true } },
        chantier: { select: { id: true, nom: true } },
      },
      take: 30,
      orderBy: { dateRetour: "desc" },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Sorties matériel"
        description="Suivi du matériel sorti et de ses retours"
        action={
          <Link href="/sorties/nouvelle">
            <Button>
              <Plus size={16} />
              <span className="hidden sm:inline">Sortir du matériel</span>
              <span className="sm:hidden">Sortir</span>
            </Button>
          </Link>
        }
      />

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Matériel actuellement sorti ({sortiesActives.length})</CardTitle>
          </CardHeader>
          <CardBody className="!p-0">
            {sortiesActives.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={Wrench}
                  title="Tout le matériel est rentré"
                  description="Aucun matériel n'est actuellement sorti."
                />
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {sortiesActives.map((s) => {
                  const cloturer = cloturerSortie.bind(null, s.id);
                  return (
                    <li key={s.id} className="p-3 sm:p-4">
                      <div className="flex items-start gap-3">
                        <Link href={`/materiel/${s.materiel.id}`} className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden relative">
                          {s.materiel.photo ? (
                            <Image src={s.materiel.photo} alt={s.materiel.nomCommun} fill sizes="56px" className="object-cover" />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-slate-400 dark:text-slate-500">
                              <Wrench size={20} />
                            </div>
                          )}
                        </Link>
                        <div className="flex-1 min-w-0">
                          <Link href={`/materiel/${s.materiel.id}`} className="font-medium text-slate-900 dark:text-slate-100 hover:underline">
                            {s.materiel.nomCommun}
                          </Link>
                          <div className="text-xs text-slate-500 dark:text-slate-500 truncate">
                            {[s.materiel.marque, s.materiel.modele].filter(Boolean).join(" ")}
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-500 mt-1.5">
                            {s.equipe && (
                              <Link href={`/equipes/${s.equipe.id}`} className="hover:underline">
                                <Badge color="blue">{s.equipe.nom}</Badge>
                              </Link>
                            )}
                            {s.chantier && (
                              <Link href={`/chantiers/${s.chantier.id}`} className="hover:underline">
                                <Badge color="orange">{s.chantier.nom}</Badge>
                              </Link>
                            )}
                            <span className="text-slate-400 dark:text-slate-500">depuis {formatDate(s.dateSortie)}</span>
                          </div>
                          {s.note && <div className="text-xs text-slate-500 dark:text-slate-500 mt-1 italic">{s.note}</div>}
                        </div>
                      </div>
                      <form action={cloturer} className="mt-3 flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
                        <div className="sm:flex-1">
                          <label className="block text-xs text-slate-500 dark:text-slate-500 mb-1">État au retour</label>
                          <Select name="etatRetour" defaultValue="BON" required>
                            <option value="BON">Bon état</option>
                            <option value="USE">Usé</option>
                            <option value="CASSE">Cassé</option>
                            <option value="MANQUANT">Manquant</option>
                          </Select>
                        </div>
                        <div className="sm:flex-1">
                          <label className="block text-xs text-slate-500 dark:text-slate-500 mb-1">Note retour (optionnel)</label>
                          <input
                            name="note"
                            placeholder="Manque les embouts..."
                            className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                          />
                        </div>
                        <Button type="submit" size="md">
                          <ArrowRight size={14} /> Marquer rentré
                        </Button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        {sortiesCloturees.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Historique récent (30 derniers retours)</CardTitle>
            </CardHeader>
            <CardBody className="!p-0">
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {sortiesCloturees.map((s) => (
                  <li key={s.id} className="p-3 flex items-center gap-3 text-sm">
                    <div className="w-9 h-9 shrink-0 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden relative">
                      {s.materiel.photo ? (
                        <Image src={s.materiel.photo} alt={s.materiel.nomCommun} fill sizes="36px" className="object-cover" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-slate-400 dark:text-slate-500">
                          <Wrench size={14} />
                        </div>
                      )}
                    </div>
                    <Link href={`/materiel/${s.materiel.id}`} className="font-medium text-slate-700 dark:text-slate-300 hover:underline truncate flex-1 min-w-0">
                      {s.materiel.nomCommun}
                    </Link>
                    <div className="text-xs text-slate-500 dark:text-slate-500 hidden sm:block truncate">
                      {s.equipe?.nom || s.chantier?.nom || "—"}
                    </div>
                    {s.etatRetour && (
                      <Badge color={etatColor[s.etatRetour] ?? "slate"}>{etatLabel[s.etatRetour]}</Badge>
                    )}
                    <div className="text-xs text-slate-400 dark:text-slate-500 shrink-0">{formatDate(s.dateRetour)}</div>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
