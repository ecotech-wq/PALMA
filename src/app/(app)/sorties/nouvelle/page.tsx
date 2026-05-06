import { db } from "@/lib/db";
import { Card, CardBody } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input, Field, Select, Textarea } from "@/components/ui/Input";
import { createSortie } from "../actions";

export default async function NouvelleSortiePage() {
  const [materielsDispo, equipes, chantiers] = await Promise.all([
    db.materiel.findMany({
      where: { statut: "DISPO", possesseur: { in: ["ENTREPRISE", "LOCATION"] } },
      select: { id: true, nomCommun: true, marque: true, modele: true },
      orderBy: { nomCommun: "asc" },
    }),
    db.equipe.findMany({
      include: { chantier: { select: { id: true, nom: true } } },
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
      <PageHeader
        title="Sortir du matériel"
        description="Indique qui prend ce matériel et pour quel chantier"
        backHref="/sorties"
      />
      <Card>
        <CardBody>
          {materielsDispo.length === 0 ? (
            <div className="text-sm text-slate-500 dark:text-slate-500 py-6 text-center">
              Aucun matériel disponible. Crée du matériel ou clôture une sortie en cours.
            </div>
          ) : (
            <form action={createSortie} className="space-y-4">
              <Field label="Matériel à sortir" required>
                <Select name="materielId" required defaultValue="">
                  <option value="" disabled>Choisir un matériel disponible…</option>
                  {materielsDispo.map((m) => {
                    const sub = [m.marque, m.modele].filter(Boolean).join(" ");
                    return (
                      <option key={m.id} value={m.id}>
                        {m.nomCommun}
                        {sub && ` — ${sub}`}
                      </option>
                    );
                  })}
                </Select>
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Équipe" hint="Au moins équipe ou chantier">
                  <Select name="equipeId" defaultValue="">
                    <option value="">— Aucune —</option>
                    {equipes.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nom}
                        {e.chantier ? ` (${e.chantier.nom})` : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Chantier" hint="Au moins équipe ou chantier">
                  <Select name="chantierId" defaultValue="">
                    <option value="">— Aucun —</option>
                    {chantiers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nom}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <Field label="Note">
                <Textarea name="note" rows={2} placeholder="Avec 2 batteries, embouts cruciformes..." />
              </Field>

              <div className="flex justify-end pt-2">
                <Button type="submit">Enregistrer la sortie</Button>
              </div>
            </form>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
