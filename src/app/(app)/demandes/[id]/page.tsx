import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Check,
  X,
  Trash2,
  ShoppingCart,
  Package,
  ChevronRight,
} from "lucide-react";
import { db } from "@/lib/db";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Field, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { requireAuth } from "@/lib/auth-helpers";
import { DemandeStatutBadge } from "../DemandeBadges";
import { DemandeForm } from "../DemandeForm";
import {
  approveDemande,
  refuseDemande,
  markDemandeCommandee,
  deleteDemande,
  updateDemande,
} from "../actions";

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const urgenceLabel: Record<string, { label: string; color: "blue" | "yellow" | "red" }> = {
  INFO: { label: "Info", color: "blue" },
  ATTENTION: { label: "Attention", color: "yellow" },
  URGENT: { label: "Urgent", color: "red" },
};

export default async function DemandeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await requireAuth();

  const [demande, chantiers] = await Promise.all([
    db.demandeMateriel.findUnique({
      where: { id },
      include: {
        chantier: { select: { id: true, nom: true } },
        requester: { select: { id: true, name: true } },
        approver: { select: { id: true, name: true } },
      },
    }),
    db.chantier.findMany({
      select: { id: true, nom: true },
      orderBy: { nom: "asc" },
    }),
  ]);

  if (!demande) notFound();

  const canEdit =
    (me.isAdmin || demande.requesterId === me.id) &&
    demande.statut === "DEMANDEE";
  const canDelete = canEdit;
  const approveAction = approveDemande.bind(null, id);
  const refuseAction = refuseDemande.bind(null, id);
  const deleteAction = deleteDemande.bind(null, id);
  const updateAction = updateDemande.bind(null, id);
  const markCommandeeAction = async () => {
    "use server";
    await markDemandeCommandee(id);
  };

  const urgence = urgenceLabel[demande.urgence];

  return (
    <div>
      <PageHeader
        title="Demande de matériel"
        description={demande.chantier.nom}
        backHref="/demandes"
        action={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <DemandeStatutBadge statut={demande.statut} />
            {demande.urgence !== "ATTENTION" && (
              <Badge color={urgence.color}>{urgence.label}</Badge>
            )}
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
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package size={18} />
                Demande
              </CardTitle>
            </CardHeader>
            <CardBody className="space-y-3 text-sm">
              <div className="whitespace-pre-wrap break-words text-slate-900 dark:text-slate-100 font-medium">
                {demande.description}
              </div>
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Quantité
                  </div>
                  <div className="font-semibold">
                    {Number(demande.quantite)} {demande.unite ?? ""}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Fournisseur suggéré
                  </div>
                  <div>{demande.fournisseur ?? "—"}</div>
                </div>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 pt-3 border-t border-slate-100 dark:border-slate-800">
                Demandé par <strong>{demande.requester.name}</strong> le{" "}
                {dateFmt.format(new Date(demande.createdAt))} ·{" "}
                <Link
                  href={`/chantiers/${demande.chantier.id}`}
                  className="text-brand-700 dark:text-brand-400 hover:underline"
                >
                  {demande.chantier.nom}
                </Link>
              </div>
            </CardBody>
          </Card>

          {/* Édition (chef ou admin, et tant que DEMANDEE) */}
          {canEdit && (
            <Card>
              <CardHeader>
                <CardTitle>Modifier la demande</CardTitle>
              </CardHeader>
              <CardBody>
                <DemandeForm
                  chantiers={chantiers}
                  demande={{
                    id: demande.id,
                    chantierId: demande.chantierId,
                    description: demande.description,
                    quantite: Number(demande.quantite),
                    unite: demande.unite,
                    urgence: demande.urgence,
                    fournisseur: demande.fournisseur,
                  }}
                  action={updateAction}
                />
              </CardBody>
            </Card>
          )}

          {/* Réponse de l'admin */}
          {(demande.statut === "APPROUVEE" ||
            demande.statut === "REFUSEE" ||
            demande.statut === "COMMANDEE") && (
            <Card
              className={
                demande.statut === "REFUSEE"
                  ? "border-red-200 dark:border-red-900"
                  : "border-green-200 dark:border-green-900"
              }
            >
              <CardHeader
                className={
                  demande.statut === "REFUSEE"
                    ? "bg-red-50 dark:bg-red-950/40"
                    : "bg-green-50 dark:bg-green-950/40"
                }
              >
                <CardTitle
                  className={
                    demande.statut === "REFUSEE"
                      ? "text-red-700 dark:text-red-400"
                      : "text-green-700 dark:text-green-400"
                  }
                >
                  {demande.statut === "REFUSEE"
                    ? "Refusée"
                    : demande.statut === "COMMANDEE"
                      ? "Commandée"
                      : "Approuvée"}
                </CardTitle>
              </CardHeader>
              <CardBody className="space-y-2 text-sm">
                {demande.reponseNote && (
                  <div className="whitespace-pre-wrap break-words">
                    {demande.reponseNote}
                  </div>
                )}
                {demande.approver && demande.approuveLe && (
                  <div className="text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
                    Par <strong>{demande.approver.name}</strong> le{" "}
                    {dateFmt.format(new Date(demande.approuveLe))}
                  </div>
                )}
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          {me.isAdmin && demande.statut === "DEMANDEE" && (
            <Card>
              <CardHeader>
                <CardTitle>Validation</CardTitle>
              </CardHeader>
              <CardBody className="space-y-3">
                <form action={approveAction} className="space-y-2">
                  <Field label="Note (optionnel)">
                    <Textarea
                      name="reponseNote"
                      rows={2}
                      placeholder="Ex: OK, je passe la commande chez Point P"
                    />
                  </Field>
                  <Button type="submit" size="sm" className="w-full">
                    <Check size={14} /> Approuver
                  </Button>
                </form>

                <form
                  action={refuseAction}
                  className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800"
                >
                  <Field label="Motif de refus" required>
                    <Textarea
                      name="reponseNote"
                      rows={2}
                      required
                      placeholder="Ex: Stock disponible au dépôt, viens chercher"
                    />
                  </Field>
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    className="w-full"
                  >
                    <X size={14} /> Refuser
                  </Button>
                </form>
              </CardBody>
            </Card>
          )}

          {me.isAdmin && demande.statut === "APPROUVEE" && (
            <Card>
              <CardHeader>
                <CardTitle>Suivi</CardTitle>
              </CardHeader>
              <CardBody className="space-y-3">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  La demande est approuvée. Quand tu passes la commande,
                  marque-la ici pour clore le workflow.
                </p>
                <form action={markCommandeeAction}>
                  <Button type="submit" size="sm" className="w-full">
                    <ShoppingCart size={14} /> Marquer comme commandée
                  </Button>
                </form>
                <Link
                  href={`/commandes/nouvelle?chantierId=${demande.chantierId}`}
                  className="block text-xs text-brand-600 dark:text-brand-400 hover:underline text-center"
                >
                  Créer une nouvelle commande pour ce chantier{" "}
                  <ChevronRight size={12} className="inline" />
                </Link>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
