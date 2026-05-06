import Link from "next/link";
import { Plus, Users, Hammer } from "lucide-react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card, CardBody } from "@/components/ui/Card";
import { Input, Field, Select } from "@/components/ui/Input";
import { createEquipe } from "./actions";

export default async function EquipesListPage() {
  const [equipes, chantiers] = await Promise.all([
    db.equipe.findMany({
      include: {
        chantier: { select: { id: true, nom: true } },
        _count: { select: { ouvriers: true } },
      },
      orderBy: { nom: "asc" },
    }),
    db.chantier.findMany({
      where: { statut: { in: ["PLANIFIE", "EN_COURS", "PAUSE"] } },
      select: { id: true, nom: true },
      orderBy: { nom: "asc" },
    }),
  ]);

  return (
    <div>
      <PageHeader title="Équipes" description="Composition et affectation des équipes" />

      <Card className="mb-5">
        <CardBody>
          <form action={createEquipe} className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-5">
              <Field label="Nom de l'équipe" required>
                <Input name="nom" placeholder="Équipe Maçonnerie A..." required />
              </Field>
            </div>
            <div className="md:col-span-5">
              <Field label="Chantier (optionnel)">
                <Select name="chantierId" defaultValue="">
                  <option value="">— Pas de chantier —</option>
                  {chantiers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="md:col-span-2 flex items-end">
              <Button type="submit" className="w-full">
                <Plus size={16} /> Créer
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {equipes.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Aucune équipe"
          description="Crée tes équipes et affectes-y des ouvriers et un chantier."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {equipes.map((e) => (
            <Link
              key={e.id}
              href={`/equipes/${e.id}`}
              className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-brand-300 hover:shadow-sm transition p-4 flex flex-col gap-3"
            >
              <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                <Users size={16} className="text-brand-600" />
                {e.nom}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-500 flex items-center gap-1">
                <Hammer size={12} />
                {e.chantier ? e.chantier.nom : "Pas de chantier"}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-500 pt-2 border-t border-slate-100">
                {e._count.ouvriers} ouvrier{e._count.ouvriers > 1 ? "s" : ""}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
