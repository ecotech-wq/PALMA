import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  CheckSquare,
  FolderOpen,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  User,
} from "lucide-react";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-helpers";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { estDormante, joursDansEtape, parseChecklist } from "@/lib/affaires";
import {
  etapesParDefautDeTypologie,
  libelleEtapeDe,
  parseEtapes,
} from "@/lib/pipelines";
import type { DocPiece } from "../FeuillePiece";
import {
  AssignerActionForm,
  ChecklistAffaire,
  ContactEdit,
  IssuesAffaire,
  ProchaineActionEdit,
  ResponsableSelect,
} from "./FicheAffaireWidgets";

// ─── Fiche affaire ───────────────────────────────────────────────────────────
// Tout ce qu'il faut pour piloter une opportunité : l'étape et son ancienneté,
// le contact, la valeur, la prochaine action datée (le moteur de relances
// veille dessus), la checklist de pièces, les actions confiées à l'équipe et
// le fil de discussion (canal de l'affaire).

const eurosFmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default async function FicheAffairePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await requireAuth();
  if (!me.canPilot) redirect("/aujourdhui");

  const affaire = await db.affaire.findUnique({
    where: { id },
    include: {
      responsable: { select: { id: true, name: true } },
      chantier: { select: { id: true, nom: true } },
      // La procédure porte libellé et étapes (pipelines éditables).
      pipeline: { select: { id: true, libelle: true, etapes: true } },
      _count: { select: { documents: true } },
      taches: {
        where: { deletedAt: null },
        orderBy: { dateFin: "asc" },
        select: {
          id: true,
          nom: true,
          statut: true,
          dateFin: true,
          proprietaire: { select: { name: true } },
        },
      },
    },
  });
  if (!affaire) notFound();
  // Frontière d'espace : même règle que les chantiers, un id forgé d'un
  // autre espace tombe sur un 404 (pas de fuite d'existence).
  if (me.espaceIds && !me.espaceIds.includes(affaire.espaceId)) notFound();

  // Étapes et libellé portés par la procédure de l'affaire ; repli sur le
  // modèle par défaut de la typologie (donnée antérieure au backfill).
  const etapesAffaire = affaire.pipeline
    ? parseEtapes(affaire.pipeline.etapes)
    : etapesParDefautDeTypologie(affaire.typologie);
  const nomProcedure = affaire.pipeline?.libelle ?? affaire.typologie;
  const maintenant = new Date();
  const dormance = estDormante(affaire, maintenant);
  const checklist = parseChecklist(affaire.checklist);
  const faits = checklist.filter((c) => c.fait).length;

  // Documents de la GED d'affaire qui valident une pièce de la checklist
  // (AffaireDocument.checklistCle) : le plus récent par clé gagne (tri
  // croissant, la dernière écriture écrase les précédentes). Même calcul
  // que le fil (/messagerie/affaire/[affaireId]) : le trombone renvoie
  // vers le fichier, et cocher une pièce SANS document ouvre la feuille
  // « joindre le fichier ».
  const docParPiece: Record<string, DocPiece> = {};
  if (checklist.length > 0) {
    const docsChecklist = await db.affaireDocument.findMany({
      where: { affaireId: affaire.id, checklistCle: { not: null } },
      orderBy: { createdAt: "asc" },
      select: { checklistCle: true, fichier: true, nom: true },
    });
    for (const d of docsChecklist) {
      if (d.checklistCle) {
        docParPiece[d.checklistCle] = { url: d.fichier, nom: d.nom };
      }
    }
  }

  // Pilotes uniquement : le module Affaires est réservé aux ADMIN et
  // CONDUCTEUR (requireAffaireAccess) ; un CHEF responsable ou cible
  // recevrait des liens /affaires/... qui le redirigent vers « Aujourd'hui ».
  const responsables = await db.user.findMany({
    where: {
      status: "ACTIVE",
      role: { in: ["ADMIN", "CONDUCTEUR"] },
      ...(me.espaceIds
        ? { espaces: { some: { espaceId: { in: me.espaceIds } } } }
        : {}),
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader
        backHref={
          affaire.pipeline
            ? `/affaires?procedure=${affaire.pipeline.id}`
            : `/affaires?typologie=${affaire.typologie}`
        }
        title={affaire.titre}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{nomProcedure}</span>
            <span>·</span>
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {libelleEtapeDe(etapesAffaire, affaire.etapeCle)}
            </span>
            <span className="text-xs">
              (depuis {joursDansEtape(affaire.etapeDepuis, maintenant)} j)
            </span>
            {affaire.statut === "GAGNEE" && <Badge color="green">Gagnée</Badge>}
            {affaire.statut === "PERDUE" && <Badge color="red">Perdue</Badge>}
            {affaire.statut === "EN_COURS" && dormance && (
              <Badge color="orange">
                {dormance.motif === "ACTION_EN_RETARD"
                  ? `Action en retard de ${dormance.jours} j`
                  : `Sans action depuis ${dormance.jours} j`}
              </Badge>
            )}
          </span>
        }
        action={
          <IssuesAffaire
            affaireId={affaire.id}
            statut={affaire.statut}
            chantierId={affaire.chantierId}
          />
        }
      />

      {affaire.statut === "PERDUE" && affaire.motifPerte && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          Motif de la perte : {affaire.motifPerte}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Colonne 1 : contact, valeur, prochaine action */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Contact</CardTitle>
              <ContactEdit
                affaireId={affaire.id}
                contactNom={affaire.contactNom}
                contactTel={affaire.contactTel}
                contactEmail={affaire.contactEmail}
                adresse={affaire.adresse}
                valeurEstimee={
                  affaire.valeurEstimee === null
                    ? null
                    : Number(affaire.valeurEstimee)
                }
              />
            </CardHeader>
            <CardBody className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200">
                <User size={14} className="shrink-0 text-slate-400" />
                {/* Une affaire née de la création rapide n'a pas encore de
                    contact : même repli que la carte kanban et le hub. */}
                {affaire.contactNom || (
                  <span className="italic text-slate-400">
                    Contact à compléter
                  </span>
                )}
              </div>
              {affaire.contactTel && (
                <a
                  href={`tel:${affaire.contactTel}`}
                  className="flex items-center gap-2 text-slate-700 underline-offset-2 hover:underline dark:text-slate-300"
                >
                  <Phone size={14} className="shrink-0 text-slate-400" />
                  {affaire.contactTel}
                </a>
              )}
              {affaire.contactEmail && (
                <a
                  href={`mailto:${affaire.contactEmail}`}
                  className="flex items-center gap-2 text-slate-700 underline-offset-2 hover:underline dark:text-slate-300"
                >
                  <Mail size={14} className="shrink-0 text-slate-400" />
                  {affaire.contactEmail}
                </a>
              )}
              {affaire.adresse && (
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                  <MapPin size={14} className="shrink-0 text-slate-400" />
                  {affaire.adresse}
                </div>
              )}
              <div className="flex items-center justify-between border-t border-slate-100 pt-2 dark:border-slate-800">
                <span className="text-xs text-slate-500">Valeur estimée</span>
                <span className="font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {affaire.valeurEstimee !== null
                    ? `${eurosFmt.format(Number(affaire.valeurEstimee))} EUR`
                    : "Non chiffrée"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Responsable</span>
                <ResponsableSelect
                  affaireId={affaire.id}
                  responsableId={affaire.responsable?.id ?? null}
                  responsables={responsables}
                  canEdit={me.canPilot}
                />
              </div>
              {affaire.description && (
                <p className="border-t border-slate-100 pt-2 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:text-slate-400">
                  {affaire.description}
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Prochaine action</CardTitle>
            </CardHeader>
            <CardBody>
              <ProchaineActionEdit
                affaireId={affaire.id}
                prochaineAction={affaire.prochaineAction}
                prochaineActionLe={
                  affaire.prochaineActionLe
                    ? affaire.prochaineActionLe.toISOString().slice(0, 10)
                    : null
                }
                enRetard={dormance?.motif === "ACTION_EN_RETARD"}
                canEdit={me.canPilot && affaire.statut === "EN_COURS"}
              />
            </CardBody>
          </Card>

          {/* Fil de l'affaire : le canal dédié, dans la messagerie. */}
          <Link
            href={`/messagerie/affaire/${affaire.id}`}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/60"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-slate-50 dark:bg-slate-100 dark:text-slate-950">
              <MessageSquare size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                Fil de l&apos;affaire
              </span>
              <span className="block text-xs text-slate-500">
                Discussion et journal des étapes, dans le canal dédié
              </span>
            </span>
          </Link>

          {/* Dossier client : la GED de l'affaire, alimentée par le fil. */}
          <Link
            href={`/affaires/${affaire.id}/documents`}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/60"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-slate-50 dark:bg-slate-100 dark:text-slate-950">
              <FolderOpen size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                Dossier client
                <span className="ml-2 text-xs font-normal tabular-nums text-slate-500">
                  {affaire._count.documents} pièce
                  {affaire._count.documents > 1 ? "s" : ""}
                </span>
              </span>
              <span className="block text-xs text-slate-500">
                Photos, pièces client, conception, devis et livrables, rangés
                par catégorie
              </span>
            </span>
          </Link>

          {affaire.chantier && (
            <Link
              href={`/chantiers/${affaire.chantier.id}`}
              className="block rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900 transition hover:bg-green-100 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-200"
            >
              Convertie en chantier : {affaire.chantier.nom}
            </Link>
          )}
        </div>

        {/* Colonne 2 : checklist et actions confiées */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>
                Pièces du dossier
                {checklist.length > 0 && (
                  <span className="ml-2 text-xs font-normal tabular-nums text-slate-500">
                    {faits}/{checklist.length}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardBody>
              <ChecklistAffaire
                affaireId={affaire.id}
                items={checklist}
                docs={docParPiece}
                canEdit={me.canPilot}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Actions confiées</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              {affaire.taches.length === 0 ? (
                <p className="text-xs italic text-slate-400">
                  Aucune action confiée pour l&apos;instant.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {affaire.taches.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <CheckSquare
                        size={14}
                        className={
                          t.statut === "TERMINEE"
                            ? "shrink-0 text-green-600"
                            : "shrink-0 text-slate-400"
                        }
                      />
                      <span
                        className={`min-w-0 flex-1 truncate ${
                          t.statut === "TERMINEE"
                            ? "text-slate-400 line-through"
                            : "text-slate-800 dark:text-slate-200"
                        }`}
                      >
                        {t.nom}
                      </span>
                      <span className="shrink-0 text-[11px] text-slate-500">
                        {t.proprietaire?.name ?? "?"} ·{" "}
                        {dateFmt.format(t.dateFin)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {me.canPilot && affaire.statut === "EN_COURS" && (
                <AssignerActionForm
                  affaireId={affaire.id}
                  cibles={responsables}
                />
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
