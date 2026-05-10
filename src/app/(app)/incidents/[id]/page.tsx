import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { CheckCircle2, RotateCcw, Trash2, Play } from "lucide-react";
import { db } from "@/lib/db";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Field, Textarea } from "@/components/ui/Input";
import { requireAuth } from "@/lib/auth-helpers";
import {
  GraviteBadge,
  StatutBadge,
  categorieLabel,
} from "../IncidentBadges";
import { IncidentForm } from "../IncidentForm";
import {
  updateIncident,
  resolveIncident,
  reopenIncident,
  setIncidentEnCours,
  deleteIncident,
} from "../actions";

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function IncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await requireAuth();

  const [incident, chantiers] = await Promise.all([
    db.incident.findUnique({
      where: { id },
      include: {
        chantier: { select: { id: true, nom: true } },
        reporter: { select: { id: true, name: true } },
        resolver: { select: { id: true, name: true } },
      },
    }),
    db.chantier.findMany({
      select: { id: true, nom: true },
      orderBy: { nom: "asc" },
    }),
  ]);

  if (!incident) notFound();

  const canEdit = me.isAdmin || incident.reporterId === me.id;
  const canDelete =
    me.isAdmin ||
    (incident.reporterId === me.id && incident.statut === "OUVERT");
  const resolveAction = resolveIncident.bind(null, id);
  const reopenAction = reopenIncident.bind(null, id);
  const setEnCoursAction = setIncidentEnCours.bind(null, id);
  const deleteAction = deleteIncident.bind(null, id);
  const updateAction = updateIncident.bind(null, id);

  return (
    <div>
      <PageHeader
        title={incident.titre}
        backHref="/incidents"
        action={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <StatutBadge statut={incident.statut} />
            <GraviteBadge gravite={incident.gravite} />
            {canDelete && (
              <form action={deleteAction}>
                <Button type="submit" variant="danger" size="sm">
                  <Trash2 size={14} />
                </Button>
              </form>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {/* Détails */}
          <Card>
            <CardHeader>
              <CardTitle>Détails</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Catégorie
                  </div>
                  <div className="font-medium">
                    {categorieLabel[incident.categorie]}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Chantier
                  </div>
                  <div className="font-medium">
                    {incident.chantier ? (
                      <Link
                        href={`/chantiers/${incident.chantier.id}`}
                        className="text-brand-700 dark:text-brand-400 hover:underline"
                      >
                        {incident.chantier.nom}
                      </Link>
                    ) : (
                      <span className="italic text-slate-400">—</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                  Description
                </div>
                <div className="whitespace-pre-wrap break-words">
                  {incident.description}
                </div>
              </div>

              {incident.photos.length > 0 && (
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                    Photos
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {incident.photos.map((url, idx) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="relative aspect-square rounded-md overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 hover:ring-2 hover:ring-brand-300 transition"
                      >
                        <Image
                          src={url}
                          alt={`Photo ${idx + 1}`}
                          fill
                          sizes="120px"
                          className="object-cover"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          {/* Édition (admin/auteur) */}
          {canEdit && incident.statut !== "RESOLU" && (
            <Card>
              <CardHeader>
                <CardTitle>Modifier l&apos;incident</CardTitle>
              </CardHeader>
              <CardBody>
                <IncidentForm
                  chantiers={chantiers}
                  incident={{
                    id: incident.id,
                    chantierId: incident.chantierId,
                    titre: incident.titre,
                    description: incident.description,
                    categorie: incident.categorie,
                    gravite: incident.gravite,
                    photos: incident.photos,
                  }}
                  action={updateAction}
                />
              </CardBody>
            </Card>
          )}

          {/* Résolution */}
          {incident.statut === "RESOLU" && incident.resolutionNote && (
            <Card className="border-green-200 dark:border-green-900">
              <CardHeader className="bg-green-50 dark:bg-green-950/40">
                <CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-400">
                  <CheckCircle2 size={18} />
                  Résolu
                </CardTitle>
              </CardHeader>
              <CardBody className="space-y-2 text-sm">
                <div className="whitespace-pre-wrap break-words">
                  {incident.resolutionNote}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
                  Clos le{" "}
                  {incident.resolvedAt
                    ? dateFmt.format(new Date(incident.resolvedAt))
                    : "—"}
                  {incident.resolver ? ` par ${incident.resolver.name}` : ""}
                </div>
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Signalé par <strong>{incident.reporter.name}</strong>
                <br />
                {dateFmt.format(new Date(incident.createdAt))}
              </div>

              {incident.statut === "OUVERT" && (
                <form action={setEnCoursAction}>
                  <Button type="submit" variant="outline" size="sm" className="w-full">
                    <Play size={14} /> Marquer en cours
                  </Button>
                </form>
              )}

              {incident.statut !== "RESOLU" && me.isAdmin && (
                <form action={resolveAction} className="space-y-2">
                  <Field
                    label="Note de résolution"
                    required
                    hint="Comment a été réglé l'incident ?"
                  >
                    <Textarea
                      name="resolutionNote"
                      rows={3}
                      required
                      placeholder="Ex: Camion réparé, livraison effectuée le lendemain..."
                    />
                  </Field>
                  <Button type="submit" size="sm" className="w-full">
                    <CheckCircle2 size={14} /> Marquer résolu
                  </Button>
                </form>
              )}

              {incident.statut === "RESOLU" && me.isAdmin && (
                <form action={reopenAction}>
                  <Button type="submit" variant="outline" size="sm" className="w-full">
                    <RotateCcw size={14} /> Rouvrir
                  </Button>
                </form>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
