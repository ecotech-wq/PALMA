import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Users, Hammer } from "lucide-react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card, CardBody } from "@/components/ui/Card";
import { Input, Field, Select } from "@/components/ui/Input";
import { ResettingForm } from "@/components/ResettingForm";
import { createEquipe } from "./actions";
import { requireAuth, espaceFilter, getAccessibleChantierIds } from "@/lib/auth-helpers";

export default async function EquipesListPage() {
  const me = await requireAuth();
  // Garde de page (audit 2026-07-17) : le layout ne protège pas la page
  // (rendu parallèle). Gestion des équipes = pilotage.
  if (!me.canPilot) redirect("/aujourdhui");
  // Le Select de chantier ne propose que les chantiers PILOTABLES (un
  // conducteur n'attache une équipe qu'à un chantier dont il est membre :
  // requireChantierManager refuserait sinon). Un admin voit tout l'espace.
  const accessibleIds = await getAccessibleChantierIds(me);
  const borneChantier =
    accessibleIds === null ? {} : { id: { in: accessibleIds } };
  const [equipes, chantiers] = await Promise.all([
    db.equipe.findMany({
      where: espaceFilter(me),
      include: {
        chantier: { select: { id: true, nom: true } },
        _count: { select: { ouvriers: true } },
      },
      orderBy: { nom: "asc" },
    }),
    db.chantier.findMany({
      where: {
        statut: { in: ["PLANIFIE", "EN_COURS", "PAUSE"] },
        ...borneChantier,
      },
      select: { id: true, nom: true },
      orderBy: { nom: "asc" },
    }),
  ]);

  // Mode « tous les espaces » : on ne sait pas dans quelle entreprise ranger
  // une nouvelle équipe (createEquipe exige un espace unique). On remplace
  // le formulaire par une invitation à choisir, au lieu d'un échec masqué.
  const espaceChoisi = me.espaceCourant !== null;

  return (
    <div>
      <PageHeader title="Équipes" description="Composition et affectation des équipes" />

      {!espaceChoisi ? (
        <Card className="mb-5">
          <CardBody className="text-sm text-slate-600 dark:text-slate-400">
            Choisis d&apos;abord une entreprise dans le sélecteur pour créer
            une équipe (le mode « tous les espaces » ne permet pas de savoir
            à quelle entreprise la rattacher).
          </CardBody>
        </Card>
      ) : (
      <Card className="mb-5">
        <CardBody>
          <ResettingForm
            action={createEquipe}
            successMessage="Équipe créée"
            className="grid grid-cols-1 md:grid-cols-12 gap-3"
          >
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
          </ResettingForm>
        </CardBody>
      </Card>
      )}

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
