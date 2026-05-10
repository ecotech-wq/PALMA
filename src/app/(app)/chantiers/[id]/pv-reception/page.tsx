import { notFound, redirect } from "next/navigation";
import {
  ClipboardCheck,
  CheckCircle2,
  Printer,
} from "lucide-react";
import Link from "next/link";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { db } from "@/lib/db";
import { requireAuth, requireChantierAccess } from "@/lib/auth-helpers";
import { updatePvInfos } from "./actions";
import { PvSignBox } from "./PvSignBox";
import { PvWorkspace } from "./PvWorkspace";
import { PvAdminActions } from "./PvAdminActions";

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function isoDay(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

function statutBadge(statut: string) {
  switch (statut) {
    case "BROUILLON":
      return <Badge color="yellow">Brouillon</Badge>;
    case "ENVOYE_CLIENT":
      return <Badge color="blue">En attente du client</Badge>;
    case "SIGNE_CLIENT":
      return <Badge color="green">Signé client</Badge>;
    case "RESERVES_LEVEES":
      return <Badge color="green">Réserves levées</Badge>;
    default:
      return null;
  }
}

export default async function PvReceptionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await requireAuth();
  await requireChantierAccess(me, id);

  const chantier = await db.chantier.findUnique({
    where: { id },
    select: { id: true, nom: true, adresse: true },
  });
  if (!chantier) notFound();

  let pv = await db.pvReception.findUnique({
    where: { chantierId: id },
    include: {
      plans: { orderBy: { ordre: "asc" } },
      reserves: { orderBy: { numero: "asc" } },
    },
  });

  // Admin sans PV → on crée un brouillon vide à la volée
  if (!pv && me.isAdmin) {
    await db.pvReception.create({
      data: { chantierId: id, dateReception: new Date() },
    });
    pv = await db.pvReception.findUnique({
      where: { chantierId: id },
      include: {
        plans: { orderBy: { ordre: "asc" } },
        reserves: { orderBy: { numero: "asc" } },
      },
    });
  }

  // Client sans PV → rien à signer
  if (!pv && me.isClient) {
    return (
      <div>
        <PageHeader
          title={`PV de réception — ${chantier.nom}`}
          backHref={`/chantiers/${id}`}
        />
        <Card>
          <CardBody>
            <div className="text-sm text-slate-600 dark:text-slate-400 italic text-center py-6">
              Aucun PV de réception en cours pour ce chantier.
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  // Client mais PV en brouillon → bloquer
  if (pv && me.isClient && pv.statut === "BROUILLON") {
    redirect(`/chantiers/${id}`);
  }

  if (!pv) notFound();

  const updateInfosAction = updatePvInfos.bind(null, id);

  const isAdmin = me.isAdmin;
  const isClient = me.isClient;
  const editable = isAdmin && pv.statut === "BROUILLON";
  const canAdminSign = isAdmin && pv.statut === "BROUILLON";
  const canClientSign =
    isClient && pv.statut === "ENVOYE_CLIENT" && !pv.signatureClientUrl;
  const canClientSignLevee =
    isClient &&
    pv.statut === "SIGNE_CLIENT" &&
    pv.reserves.length > 0 &&
    !pv.reservesLeveeUrl;
  const canReset = isAdmin && pv.statut !== "BROUILLON";

  // Map des plans pour résoudre planId -> nom dans la liste des réserves
  const planMap = new Map(pv.plans.map((p) => [p.id, p]));

  return (
    <div>
      <PageHeader
        title={`PV de réception — ${chantier.nom}`}
        description={chantier.adresse ?? undefined}
        backHref={`/chantiers/${id}`}
        action={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {statutBadge(pv.statut)}
            <Link href={`/chantiers/${id}/pv-reception/print`} target="_blank">
              <Button size="sm" variant="outline">
                <Printer size={14} />
                <span className="hidden sm:inline">Imprimer / PDF</span>
              </Button>
            </Link>
            {isAdmin && (
              <PvAdminActions chantierId={id} canReset={canReset} />
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          {/* Infos générales */}
          <Card>
            <CardHeader>
              <CardTitle>
                <ClipboardCheck size={16} className="inline mr-1" />
                Informations
              </CardTitle>
            </CardHeader>
            <CardBody>
              {editable ? (
                <form action={updateInfosAction} className="space-y-3">
                  <Field label="Date de réception">
                    <Input
                      type="date"
                      name="dateReception"
                      defaultValue={isoDay(pv.dateReception)}
                      required
                    />
                  </Field>
                  <Field
                    label="Récapitulatif (optionnel)"
                    hint="Travaux effectués, observations générales..."
                  >
                    <Textarea
                      name="texteRecap"
                      rows={3}
                      defaultValue={pv.texteRecap ?? ""}
                      placeholder="Les travaux de gros œuvre sont terminés..."
                    />
                  </Field>
                  <div className="flex justify-end">
                    <Button type="submit" size="sm">
                      Enregistrer
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="space-y-2 text-sm">
                  <div>
                    <strong className="text-xs uppercase tracking-wide text-slate-500">
                      Date de réception
                    </strong>
                    <br />
                    {dateFmt.format(new Date(pv.dateReception))}
                  </div>
                  {pv.texteRecap && (
                    <div>
                      <strong className="text-xs uppercase tracking-wide text-slate-500">
                        Récapitulatif
                      </strong>
                      <br />
                      <p className="whitespace-pre-wrap break-words text-slate-700 dark:text-slate-300">
                        {pv.texteRecap}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardBody>
          </Card>

          {/* Workspace plans + réserves (style Archipad) */}
          <PvWorkspace
            chantierId={id}
            isAdmin={isAdmin}
            canEdit={editable}
            plans={pv.plans.map((p) => ({
              id: p.id,
              url: p.url,
              nom: p.nom,
            }))}
            reserves={pv.reserves.map((r) => ({
              id: r.id,
              numero: r.numero,
              texte: r.texte,
              zone: r.zone,
              lot: r.lot,
              dateLimite: r.dateLimite,
              photos: r.photos,
              planId: r.planId,
              planNom: r.planId
                ? planMap.get(r.planId)?.nom ?? "Plan"
                : null,
              hasPosition: r.posX !== null && r.posY !== null,
              posX: r.posX,
              posY: r.posY,
              leveLe: r.leveLe,
              leveNote: r.leveNote,
            }))}
          />

          {/* Signatures */}
          <Card>
            <CardHeader>
              <CardTitle>Signatures</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              {/* Signature admin */}
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
                  Maître d&apos;œuvre
                </div>
                {pv.signatureAdminUrl ? (
                  <div className="flex items-start gap-3">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-2 inline-block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={pv.signatureAdminUrl}
                        alt="Signature admin"
                        className="max-h-24"
                      />
                    </div>
                    {pv.signatureAdminLe && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 self-end">
                        <CheckCircle2
                          size={12}
                          className="inline mr-1 text-green-600"
                        />
                        Signé le{" "}
                        {dateTimeFmt.format(new Date(pv.signatureAdminLe))}
                      </p>
                    )}
                  </div>
                ) : canAdminSign ? (
                  <PvSignBox
                    chantierId={id}
                    role="admin"
                    label="Signer et envoyer au client"
                  />
                ) : (
                  <p className="text-sm text-slate-500 italic">
                    En attente de signature de l&apos;admin.
                  </p>
                )}
              </div>

              {/* Signature client */}
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
                  Maître d&apos;ouvrage / Client
                </div>
                {pv.signatureClientUrl ? (
                  <div className="flex items-start gap-3">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-2 inline-block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={pv.signatureClientUrl}
                        alt="Signature client"
                        className="max-h-24"
                      />
                    </div>
                    {pv.signatureClientLe && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 self-end">
                        <CheckCircle2
                          size={12}
                          className="inline mr-1 text-green-600"
                        />
                        Signé le{" "}
                        {dateTimeFmt.format(new Date(pv.signatureClientLe))}
                      </p>
                    )}
                  </div>
                ) : canClientSign ? (
                  <PvSignBox
                    chantierId={id}
                    role="client"
                    label="Signer la réception"
                  />
                ) : (
                  <p className="text-sm text-slate-500 italic">
                    {pv.statut === "BROUILLON"
                      ? "L'admin doit d'abord signer et envoyer le PV."
                      : "En attente de signature client."}
                  </p>
                )}
              </div>

              {/* Levée des réserves (uniquement si réserves) */}
              {pv.reserves.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
                    Levée des réserves
                  </div>
                  {pv.reservesLeveeUrl ? (
                    <div className="flex items-start gap-3">
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-2 inline-block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={pv.reservesLeveeUrl}
                          alt="Signature levée des réserves"
                          className="max-h-24"
                        />
                      </div>
                      {pv.reservesLeveeLe && (
                        <p className="text-xs text-slate-600 dark:text-slate-400 self-end">
                          <CheckCircle2
                            size={12}
                            className="inline mr-1 text-green-600"
                          />
                          Levé le{" "}
                          {dateTimeFmt.format(new Date(pv.reservesLeveeLe))}
                        </p>
                      )}
                    </div>
                  ) : canClientSignLevee ? (
                    <PvSignBox
                      chantierId={id}
                      role="levee"
                      label="Signer la levée des réserves"
                    />
                  ) : (
                    <p className="text-sm text-slate-500 italic">
                      {pv.statut === "SIGNE_CLIENT"
                        ? "Quand toutes les réserves seront traitées, le client pourra signer la levée."
                        : "En attente de la signature du client sur la réception initiale."}
                    </p>
                  )}
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Sidebar récap */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>État du PV</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">
                  Statut
                </span>
                <span>{statutBadge(pv.statut)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">
                  Plans
                </span>
                <strong>{pv.plans.length}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">
                  Réserves
                </span>
                <strong>{pv.reserves.length}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">
                  Levées
                </span>
                <strong className="text-green-700">
                  {pv.reserves.filter((r) => r.leveLe).length}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">
                  Sig. admin
                </span>
                <span>
                  {pv.signatureAdminUrl ? (
                    <CheckCircle2 size={14} className="text-green-600" />
                  ) : (
                    "—"
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">
                  Sig. client
                </span>
                <span>
                  {pv.signatureClientUrl ? (
                    <CheckCircle2 size={14} className="text-green-600" />
                  ) : (
                    "—"
                  )}
                </span>
              </div>
              {pv.reserves.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">
                    Sig. levée
                  </span>
                  <span>
                    {pv.reservesLeveeUrl ? (
                      <CheckCircle2 size={14} className="text-green-600" />
                    ) : (
                      "—"
                    )}
                  </span>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
