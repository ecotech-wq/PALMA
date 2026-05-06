import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Trash2, User, Plus, Wrench } from "lucide-react";
import { db } from "@/lib/db";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Input, Field, Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { updateEquipe, deleteEquipe, affecterOuvrierAEquipe } from "../actions";

const contratLabel: Record<string, string> = {
  FIXE: "Fixe",
  JOUR: "Journalier",
  SEMAINE: "Hebdo",
  MOIS: "Au mois",
  FORFAIT: "Forfait",
};

export default async function EquipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [equipe, chantiers, ouvriersLibres, sortiesActives] = await Promise.all([
    db.equipe.findUnique({
      where: { id },
      include: {
        ouvriers: { orderBy: { nom: "asc" } },
        chantier: { select: { id: true, nom: true } },
      },
    }),
    db.chantier.findMany({
      where: { statut: { in: ["PLANIFIE", "EN_COURS", "PAUSE"] } },
      select: { id: true, nom: true },
      orderBy: { nom: "asc" },
    }),
    db.ouvrier.findMany({
      where: { OR: [{ equipeId: null }, { equipeId: id }], actif: true },
      orderBy: { nom: "asc" },
    }),
    db.sortieMateriel.findMany({
      where: { equipeId: id, dateRetour: null },
      include: { materiel: { select: { nomCommun: true, marque: true, modele: true, photo: true } } },
      orderBy: { dateSortie: "desc" },
    }),
  ]);
  if (!equipe) notFound();

  const updateAction = updateEquipe.bind(null, id);
  const deleteAction = deleteEquipe.bind(null, id);
  const ouvriersDisponibles = ouvriersLibres.filter((o) => o.equipeId !== id);

  return (
    <div>
      <PageHeader
        title={equipe.nom}
        description={equipe.chantier ? `Chantier : ${equipe.chantier.nom}` : "Pas affectée à un chantier"}
        backHref="/equipes"
        action={
          <form action={deleteAction}>
            <Button type="submit" variant="danger" size="sm">
              <Trash2 size={14} />
              <span className="hidden sm:inline">Supprimer</span>
            </Button>
          </form>
        }
      />

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Informations</CardTitle>
          </CardHeader>
          <CardBody>
            <form action={updateAction} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-5">
                <Field label="Nom" required>
                  <Input name="nom" defaultValue={equipe.nom} required />
                </Field>
              </div>
              <div className="md:col-span-5">
                <Field label="Chantier">
                  <Select name="chantierId" defaultValue={equipe.chantierId ?? ""}>
                    <option value="">— Pas de chantier —</option>
                    {chantiers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nom}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="md:col-span-2">
                <Button type="submit" className="w-full">Enregistrer</Button>
              </div>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ouvriers de l&apos;équipe</CardTitle>
          </CardHeader>
          <CardBody>
            {equipe.ouvriers.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-500 mb-4">Aucun ouvrier dans cette équipe.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 mb-4">
                {equipe.ouvriers.map((o) => {
                  const detach = affecterOuvrierAEquipe.bind(null, o.id, null);
                  const fullName = [o.prenom, o.nom].filter(Boolean).join(" ");
                  return (
                    <li key={o.id} className="py-2 flex items-center gap-3">
                      <div className="w-9 h-9 shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden relative">
                        {o.photo ? (
                          <Image src={o.photo} alt={fullName} fill sizes="36px" className="object-cover" />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-slate-400 dark:text-slate-500">
                            <User size={16} />
                          </div>
                        )}
                      </div>
                      <Link href={`/ouvriers/${o.id}`} className="flex-1 min-w-0 text-sm hover:underline">
                        <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{fullName}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-500">
                          <Badge color="blue">{contratLabel[o.typeContrat]}</Badge>
                        </div>
                      </Link>
                      <form action={detach}>
                        <button
                          type="submit"
                          className="text-xs text-slate-500 dark:text-slate-500 hover:text-red-600"
                        >
                          Retirer
                        </button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            )}

            {ouvriersDisponibles.length > 0 && (
              <form
                action={async (fd: FormData) => {
                  "use server";
                  const ouvrierId = String(fd.get("ouvrierId"));
                  if (!ouvrierId) return;
                  const { affecterOuvrierAEquipe: affecter } = await import("../actions");
                  await affecter(ouvrierId, id);
                }}
                className="flex gap-2"
              >
                <select
                  name="ouvrierId"
                  required
                  defaultValue=""
                  className="flex-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                >
                  <option value="" disabled>Ajouter un ouvrier libre…</option>
                  {ouvriersDisponibles.map((o) => (
                    <option key={o.id} value={o.id}>
                      {[o.prenom, o.nom].filter(Boolean).join(" ")}
                    </option>
                  ))}
                </select>
                <Button type="submit" size="sm">
                  <Plus size={14} /> Ajouter
                </Button>
              </form>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Matériel en cours d&apos;utilisation</CardTitle>
          </CardHeader>
          <CardBody>
            {sortiesActives.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-500">
                Aucun matériel sorti pour cette équipe.{" "}
                <Link href="/sorties/nouvelle" className="text-brand-600 hover:underline">
                  Sortir du matériel
                </Link>
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {sortiesActives.map((s) => (
                  <li key={s.id} className="py-2 flex items-center gap-3">
                    <div className="w-10 h-10 shrink-0 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden relative">
                      {s.materiel.photo ? (
                        <Image src={s.materiel.photo} alt={s.materiel.nomCommun} fill sizes="40px" className="object-cover" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-slate-400 dark:text-slate-500">
                          <Wrench size={16} />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 text-sm">
                      <div className="font-medium truncate">{s.materiel.nomCommun}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-500 truncate">
                        {[s.materiel.marque, s.materiel.modele].filter(Boolean).join(" ")}
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-500">
                      depuis le {new Date(s.dateSortie).toLocaleDateString("fr-FR")}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
