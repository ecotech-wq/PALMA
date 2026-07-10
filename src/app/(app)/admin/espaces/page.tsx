import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Input";
import { ResettingForm } from "@/components/ResettingForm";
import { majEspace } from "./actions";

// ─── Entreprises (espaces) : nom, couleur d'accent, modules ──────────────────
// Réservé au propriétaire de plateforme. La couleur d'accent habille l'avatar
// de l'entreprise et sa pastille dans le sélecteur (charte : « l'espace colore
// son coin »), jamais les boutons ni la navigation.

export default async function AdminEspacesPage() {
  const me = await requireAuth();
  if (!me.isGlobalAdmin) redirect("/dashboard");

  const espaces = await db.espace.findMany({
    orderBy: { nom: "asc" },
    select: {
      id: true,
      nom: true,
      couleur: true,
      modules: true,
      _count: { select: { membres: true, chantiers: true } },
    },
  });

  return (
    <div>
      <PageHeader
        backHref="/admin/users"
        title="Entreprises"
        description="Nom, couleur d'accent et modules de chaque entreprise. La couleur habille l'avatar et le sélecteur, jamais les boutons ni la navigation."
      />

      <div className="grid gap-4 md:grid-cols-2">
        {espaces.map((e) => {
          const couleur = e.couleur ?? "#6e6a63";
          const initiale = e.nom.trim().charAt(0).toUpperCase() || "?";
          return (
            <Card key={e.id}>
              <CardBody>
                <div className="mb-3 flex items-center gap-3">
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-semibold text-white"
                    style={{ backgroundColor: couleur }}
                  >
                    {initiale}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                      {e.nom}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {e._count.membres} membre{e._count.membres > 1 ? "s" : ""} ·{" "}
                      {e._count.chantiers} projet{e._count.chantiers > 1 ? "s" : ""}
                    </p>
                  </div>
                </div>

                <ResettingForm
                  action={majEspace.bind(null, e.id)}
                  successMessage="Entreprise mise à jour"
                  className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                >
                  <Field label="Nom" required>
                    <Input name="nom" defaultValue={e.nom} required />
                  </Field>
                  <Field label="Couleur d'accent" hint="Avatar et pastille du sélecteur">
                    <input
                      type="color"
                      name="couleur"
                      defaultValue={couleur}
                      className="h-10 w-full cursor-pointer rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-1"
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Modules (apps) exposés
                    </span>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                        <input
                          type="checkbox"
                          name="modules"
                          value="chantier"
                          defaultChecked={e.modules.includes("chantier")}
                          className="rounded border-slate-400 text-brand-600 focus:ring-brand-500"
                        />
                        Chantier (construction)
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                        <input
                          type="checkbox"
                          name="modules"
                          value="be"
                          defaultChecked={e.modules.includes("be")}
                          className="rounded border-slate-400 text-brand-600 focus:ring-brand-500"
                        />
                        Bureau d'études
                      </label>
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <Button type="submit" size="sm">
                      Enregistrer
                    </Button>
                  </div>
                </ResettingForm>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
