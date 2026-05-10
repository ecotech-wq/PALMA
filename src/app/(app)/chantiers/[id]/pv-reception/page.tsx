import { notFound, redirect } from "next/navigation";
import {
  ClipboardCheck,
  AlertTriangle,
  CheckCircle2,
  X,
} from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { db } from "@/lib/db";
import { requireAuth, requireChantierAccess } from "@/lib/auth-helpers";
import {
  updatePvInfos,
  ajouterReserve,
  retirerReserve,
} from "./actions";
import { PvSignBox } from "./PvSignBox";

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

  let pv = await db.pvReception.findUnique({ where: { chantierId: id } });

  // Si admin et pas de PV → on en crée un brouillon vide à la volée
  if (!pv && me.isAdmin) {
    pv = await db.pvReception.create({
      data: {
        chantierId: id,
        dateReception: new Date(),
      },
    });
  }

  // Si client et pas de PV → rien à signer
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

  // Si client mais PV en brouillon → bloquer
  if (pv && me.isClient && pv.statut === "BROUILLON") {
    redirect(`/chantiers/${id}`);
  }

  if (!pv) notFound();

  const updateInfosAction = updatePvInfos.bind(null, id);
  const ajouterReserveAction = ajouterReserve.bind(null, id);

  const isAdmin = me.isAdmin;
  const isClient = me.isClient;
  const canAdminSign = isAdmin && pv.statut === "BROUILLON";
  const canClientSign =
    isClient && pv.statut === "ENVOYE_CLIENT" && !pv.signatureClientUrl;
  const canClientSignLevee =
    isClient &&
    pv.statut === "SIGNE_CLIENT" &&
    pv.reserves.length > 0 &&
    !pv.reservesLeveeUrl;

  return (
    <div>
      <PageHeader
        title={`PV de réception — ${chantier.nom}`}
        description={chantier.adresse ?? undefined}
        backHref={`/chantiers/${id}`}
        action={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {statutBadge(pv.statut)}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          {/* Infos générales */}
          <Card>
            <CardHeader>
              <CardTitle>
                <ClipboardCheck size={16} className="inline mr-1" /> Procès-verbal
              </CardTitle>
            </CardHeader>
            <CardBody>
              {isAdmin && pv.statut === "BROUILLON" ? (
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
                      rows={4}
                      defaultValue={pv.texteRecap ?? ""}
                      placeholder="Les travaux de gros œuvre sont terminés. La réception est prononcée..."
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

          {/* Réserves */}
          <Card>
            <CardHeader>
              <CardTitle>
                <AlertTriangle size={16} className="inline mr-1" />
                Réserves ({pv.reserves.length})
              </CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              {pv.reserves.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 italic">
                  Aucune réserve. Réception sans réserve.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {pv.reserves.map((r, i) => {
                    const removeAction = retirerReserve.bind(null, id, i);
                    return (
                      <li
                        key={i}
                        className="flex items-start gap-2 p-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900"
                      >
                        <span className="text-amber-700 dark:text-amber-400 text-xs font-mono pt-0.5">
                          {i + 1}.
                        </span>
                        <span className="flex-1 text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words">
                          {r}
                        </span>
                        {isAdmin && pv.statut === "BROUILLON" && (
                          <form action={removeAction}>
                            <button
                              type="submit"
                              aria-label="Retirer cette réserve"
                              className="text-slate-400 hover:text-red-600"
                            >
                              <X size={14} />
                            </button>
                          </form>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {isAdmin && pv.statut === "BROUILLON" && (
                <form action={ajouterReserveAction} className="flex gap-2">
                  <Input
                    type="text"
                    name="reserve"
                    placeholder="Décrire une réserve..."
                    className="flex-1"
                  />
                  <Button type="submit" size="sm" variant="secondary">
                    Ajouter
                  </Button>
                </form>
              )}
            </CardBody>
          </Card>

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

              {/* Signature levée des réserves (uniquement si réserves) */}
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
                <span className="text-slate-600 dark:text-slate-400">Statut</span>
                <span>{statutBadge(pv.statut)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">
                  Réserves
                </span>
                <strong>{pv.reserves.length}</strong>
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
                    Levée des réserves
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
