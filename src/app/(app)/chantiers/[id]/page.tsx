import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Trash2,
  Users,
  Plus,
  ShoppingCart,
  Truck,
  Banknote,
  MessageSquare,
  FileText,
  CalendarRange,
  Archive,
  ArchiveRestore,
  ClipboardCheck,
} from "lucide-react";
import { db } from "@/lib/db";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { ChantierForm } from "../ChantierForm";
import { ChantierStatutBadge } from "../ChantierStatutBadge";
import {
  updateChantier,
  deleteChantier,
  affecterEquipeAuChantier,
  archiverChantier,
  reouvrirChantier,
} from "../actions";
import { CommandeStatutBadge } from "@/app/(app)/commandes/CommandeStatutBadge";
import { formatEuro, formatDate } from "@/lib/utils";
import { getFinanceChantier } from "@/lib/finances-chantier";
import { requireAuth, requireChantierAccess } from "@/lib/auth-helpers";
import { RapportsSection } from "@/app/(app)/rapports/RapportsSection";

export default async function ChantierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await requireAuth();
  await requireChantierAccess(me, id);
  const [chantier, chefs, toutesEquipes, commandes, locations, finance, rapports] = await Promise.all([
    db.chantier.findUnique({
      where: { id },
      include: {
        chef: true,
        equipes: { include: { _count: { select: { ouvriers: true } } }, orderBy: { nom: "asc" } },
      },
    }),
    db.user.findMany({
      where: { role: "CHEF" },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    db.equipe.findMany({
      where: { OR: [{ chantierId: null }, { chantierId: id }] },
      orderBy: { nom: "asc" },
    }),
    db.commande.findMany({
      where: { chantierId: id },
      orderBy: { dateCommande: "desc" },
      take: 10,
    }),
    db.locationPret.findMany({
      where: { chantierId: id },
      orderBy: [{ cloture: "asc" }, { dateFinPrevue: "asc" }],
      take: 10,
    }),
    getFinanceChantier(id),
    db.rapportChantier.findMany({
      where: { chantierId: id },
      include: { author: { select: { id: true, name: true } } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 30,
    }),
  ]);
  if (!chantier) notFound();

  const updateAction = updateChantier.bind(null, id);
  const deleteAction = deleteChantier.bind(null, id);
  const archiverAction = archiverChantier.bind(null, id);
  const reouvrirAction = reouvrirChantier.bind(null, id);
  const isArchived = chantier.archivedAt !== null;
  const equipesNonAffectees = toutesEquipes.filter((e) => e.chantierId !== id);

  const consommePct =
    finance.budgetTotal > 0
      ? Math.min(100, Math.round((finance.coutTotal / finance.budgetTotal) * 100))
      : 0;
  const isOver = finance.coutTotal > finance.budgetTotal && finance.budgetTotal > 0;

  return (
    <div>
      <PageHeader
        title={chantier.nom}
        description={chantier.adresse ?? undefined}
        backHref="/chantiers"
        action={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <ChantierStatutBadge statut={chantier.statut} />
            {isArchived && <Badge color="slate">Archivé</Badge>}
            <Link href={`/chantiers/${id}/journal`}>
              <Button size="sm">
                <MessageSquare size={14} />
                <span className="hidden sm:inline">Journal</span>
              </Button>
            </Link>
            <Link href={`/chantiers/${id}/plans`}>
              <Button size="sm" variant="outline">
                <FileText size={14} />
                <span className="hidden sm:inline">Plans</span>
              </Button>
            </Link>
            <Link href={`/chantiers/${id}/rapport-hebdo`}>
              <Button size="sm" variant="outline">
                <CalendarRange size={14} />
                <span className="hidden sm:inline">Rapport hebdo</span>
              </Button>
            </Link>
            <Link href={`/chantiers/${id}/pv-reception`}>
              <Button size="sm" variant="outline">
                <ClipboardCheck size={14} />
                <span className="hidden sm:inline">PV réception</span>
              </Button>
            </Link>
            {me.isAdmin && !isArchived && (
              <form action={archiverAction}>
                <Button type="submit" variant="outline" size="sm">
                  <Archive size={14} />
                  <span className="hidden sm:inline">Archiver</span>
                </Button>
              </form>
            )}
            {me.isAdmin && isArchived && (
              <form action={reouvrirAction}>
                <Button type="submit" variant="outline" size="sm">
                  <ArchiveRestore size={14} />
                  <span className="hidden sm:inline">Réouvrir</span>
                </Button>
              </form>
            )}
            {me.isAdmin && (
              <form action={deleteAction}>
                <Button type="submit" variant="danger" size="sm">
                  <Trash2 size={14} />
                  <span className="hidden sm:inline">Supprimer</span>
                </Button>
              </form>
            )}
          </div>
        }
      />

      <div className={`grid grid-cols-1 ${me.isAdmin ? "lg:grid-cols-3" : ""} gap-5`}>
        <div className={me.isAdmin ? "lg:col-span-2 space-y-5" : "space-y-5"}>
          {me.isClient && (
            <Card>
              <CardHeader>
                <CardTitle>Informations</CardTitle>
              </CardHeader>
              <CardBody className="text-sm text-slate-700 dark:text-slate-300 space-y-2">
                {chantier.adresse && <div><strong className="text-xs uppercase tracking-wide text-slate-500">Adresse</strong><br/>{chantier.adresse}</div>}
                {chantier.description && <div><strong className="text-xs uppercase tracking-wide text-slate-500">Description</strong><br/>{chantier.description}</div>}
                {(chantier.dateDebut || chantier.dateFin) && (
                  <div>
                    <strong className="text-xs uppercase tracking-wide text-slate-500">Période</strong><br/>
                    {chantier.dateDebut ? formatDate(chantier.dateDebut) : "?"} → {chantier.dateFin ? formatDate(chantier.dateFin) : "?"}
                  </div>
                )}
              </CardBody>
            </Card>
          )}
          {!me.isClient && <Card>
            <CardHeader>
              <CardTitle>Informations</CardTitle>
            </CardHeader>
            <CardBody>
              <ChantierForm
                chantier={{
                  nom: chantier.nom,
                  adresse: chantier.adresse,
                  description: chantier.description,
                  dateDebut: chantier.dateDebut,
                  dateFin: chantier.dateFin,
                  statut: chantier.statut,
                  budgetEspeces: String(chantier.budgetEspeces),
                  budgetVirement: String(chantier.budgetVirement),
                  chefId: chantier.chefId,
                }}
                chefs={chefs}
                action={updateAction}
                submitLabel="Enregistrer"
                isAdmin={me.isAdmin}
              />
            </CardBody>
          </Card>}

          {!me.isClient && <Card>
            <CardHeader>
              <CardTitle>Équipes affectées</CardTitle>
            </CardHeader>
            <CardBody>
              {chantier.equipes.length === 0 && (
                <p className="text-sm text-slate-500 dark:text-slate-500 mb-3">Aucune équipe sur ce chantier.</p>
              )}
              {chantier.equipes.length > 0 && (
                <div className="space-y-2 mb-4">
                  {chantier.equipes.map((e) => {
                    const detach = affecterEquipeAuChantier.bind(null, e.id, null);
                    return (
                      <div
                        key={e.id}
                        className="flex items-center justify-between p-2 rounded-md bg-slate-50 dark:bg-slate-900"
                      >
                        <Link href={`/equipes/${e.id}`} className="flex items-center gap-2 text-sm">
                          <Users size={14} className="text-slate-400 dark:text-slate-500" />
                          <span className="font-medium">{e.nom}</span>
                          <span className="text-slate-400 dark:text-slate-500">
                            ({e._count.ouvriers} ouvrier{e._count.ouvriers > 1 ? "s" : ""})
                          </span>
                        </Link>
                        <form action={detach}>
                          <button
                            type="submit"
                            className="text-xs text-slate-500 dark:text-slate-500 hover:text-red-600"
                          >
                            Retirer
                          </button>
                        </form>
                      </div>
                    );
                  })}
                </div>
              )}

              {equipesNonAffectees.length > 0 && (
                <form
                  action={async (fd: FormData) => {
                    "use server";
                    const equipeId = String(fd.get("equipeId"));
                    if (!equipeId) return;
                    const { affecterEquipeAuChantier: affecter } = await import("../actions");
                    await affecter(equipeId, id);
                  }}
                  className="flex gap-2"
                >
                  <select
                    name="equipeId"
                    required
                    className="flex-1 rounded-md border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-900"
                    defaultValue=""
                  >
                    <option value="" disabled>Choisir une équipe libre…</option>
                    {equipesNonAffectees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nom}
                      </option>
                    ))}
                  </select>
                  <Button type="submit" size="sm">
                    <Plus size={14} /> Affecter
                  </Button>
                </form>
              )}
            </CardBody>
          </Card>}

          {/* Rapports de chantier journaliers */}
          <Card>
            <CardHeader>
              <CardTitle>Rapports de chantier ({rapports.length})</CardTitle>
            </CardHeader>
            <CardBody>
              <RapportsSection
                chantierId={id}
                currentUserId={me.id}
                isAdmin={me.isAdmin}
                rapports={rapports.map((r) => ({
                  id: r.id,
                  chantierId: r.chantierId,
                  date: r.date,
                  meteo: r.meteo,
                  texte: r.texte,
                  photos: r.photos,
                  nbOuvriers: r.nbOuvriers,
                  authorName: r.author.name,
                  authorId: r.author.id,
                  createdAt: r.createdAt,
                }))}
              />
            </CardBody>
          </Card>

          {!me.isClient && <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Commandes ({commandes.length})</CardTitle>
              <Link href={`/commandes/nouvelle?chantierId=${id}`}>
                <Button size="sm" variant="outline">
                  <Plus size={14} /> Nouvelle
                </Button>
              </Link>
            </CardHeader>
            <CardBody className="!p-0">
              {commandes.length === 0 ? (
                <div className="px-5 py-4 text-sm text-slate-500 dark:text-slate-500">Aucune commande.</div>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {commandes.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/commandes/${c.id}`}
                        className="flex items-start gap-2 p-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-900"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="font-medium truncate">
                              {c.fournisseur}
                            </span>
                            {me.isAdmin && (
                              <span className="font-semibold shrink-0">
                                {formatEuro(c.coutTotal.toString())}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                            <CommandeStatutBadge statut={c.statut} />
                            <span>{formatDate(c.dateCommande)}</span>
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>}

          {!me.isClient && <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Locations / prêts ({locations.length})</CardTitle>
              <Link href="/locations/nouvelle">
                <Button size="sm" variant="outline">
                  <Plus size={14} /> Nouvelle
                </Button>
              </Link>
            </CardHeader>
            <CardBody className="!p-0">
              {locations.length === 0 ? (
                <div className="px-5 py-4 text-sm text-slate-500 dark:text-slate-500">Aucune location ni prêt.</div>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {locations.map((l) => (
                    <li key={l.id}>
                      <Link
                        href={`/locations/${l.id}`}
                        className="flex items-start gap-2 p-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-900"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="font-medium truncate">
                              {l.designation}
                            </span>
                            {me.isAdmin && l.type === "LOCATION" && (
                              <span className="font-semibold shrink-0">
                                {formatEuro(l.coutTotal.toString())}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                            <Badge
                              color={
                                l.cloture
                                  ? "green"
                                  : l.type === "LOCATION"
                                    ? "purple"
                                    : "blue"
                              }
                            >
                              {l.cloture
                                ? "Clôturée"
                                : l.type === "LOCATION"
                                  ? "Location"
                                  : "Prêt"}
                            </Badge>
                            <span className="truncate">{l.fournisseurNom}</span>
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>}
        </div>

        {me.isAdmin && (
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Finances</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-500">Budget</div>
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {formatEuro(finance.budgetTotal)}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                  {formatEuro(finance.budgetEspeces)} espèces ·{" "}
                  {formatEuro(finance.budgetVirement)} virement
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-slate-500 dark:text-slate-500">Coût engagé</span>
                  <span
                    className={`text-xl font-bold ${
                      isOver ? "text-red-600" : "text-slate-900 dark:text-slate-100"
                    }`}
                  >
                    {formatEuro(finance.coutTotal)}
                  </span>
                </div>
                <div className="mt-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${isOver ? "bg-red-500" : "bg-blue-500"}`}
                    style={{ width: `${consommePct}%` }}
                  />
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-500 mt-1 text-right">
                  {consommePct}% consommé
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-500">
                    <Banknote size={12} /> Main d&apos;œuvre
                  </span>
                  <span className="font-medium">{formatEuro(finance.coutMainOeuvre)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-500">
                    <ShoppingCart size={12} /> Commandes
                  </span>
                  <span className="font-medium">{formatEuro(finance.coutCommandes)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-500">
                    <Truck size={12} /> Locations
                  </span>
                  <span className="font-medium">{formatEuro(finance.coutLocations)}</span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100">
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-slate-500 dark:text-slate-500">Marge</span>
                  <span
                    className={`text-lg font-bold ${
                      finance.marge < 0 ? "text-red-600" : "text-green-600"
                    }`}
                  >
                    {formatEuro(finance.marge)}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500 text-right">
                  {finance.margePct.toFixed(1)}%
                </div>
              </div>

              <div className="text-[11px] text-slate-400 dark:text-slate-500 pt-2 border-t border-slate-100">
                {finance.jourshomme} jour-homme pointé. La main d&apos;œuvre est une estimation
                basée sur les pointages × tarif journalier équivalent.
              </div>
            </CardBody>
          </Card>
        </div>
        )}
      </div>
    </div>
  );
}
