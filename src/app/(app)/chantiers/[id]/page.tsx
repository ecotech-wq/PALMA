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
  Wallet,
  ChevronRight,
  FolderOpen,
} from "lucide-react";
import { db } from "@/lib/db";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Onglets } from "@/components/ui/Onglets";
import { BoutonConfirmation } from "@/components/ui/BoutonConfirmation";
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
import { Montant } from "@/features/discret";
import { getFinanceChantier } from "@/lib/finances-chantier";
import { requireAuth, requireChantierAccess, espaceFilter } from "@/lib/auth-helpers";
import { RapportsSection } from "@/app/(app)/rapports/RapportsSection";
import {
  canManageMembers,
  isChantierMembre,
  listChantierMembres,
  listUtilisateursInvitables,
} from "@/features/membership";
import { MembresCard } from "@/features/membership/components/MembresCard";

export default async function ChantierDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ onglet?: string }>;
}) {
  const { id } = await params;
  const { onglet: ongletBrut } = await searchParams;
  const me = await requireAuth();
  await requireChantierAccess(me, id);
  const [chantier, chefs, toutesEquipes, commandes, locations, finance, rapports, nbDocs, nbDocsASigner] = await Promise.all([
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
      where: {
        OR: [{ chantierId: null }, { chantierId: id }],
        ...espaceFilter(me),
      },
      orderBy: { nom: "asc" },
    }),
    db.commande.findMany({
      where: { chantierId: id, deletedAt: null },
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
      where: { chantierId: id, deletedAt: null },
      include: { author: { select: { id: true, name: true } } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 30,
    }),
    // GED chantier : compteur pour la carte Documents (le client ne compte
    // que les pièces qui lui sont ouvertes).
    db.chantierDocument.count({
      where: { chantierId: id, ...(me.isClient ? { visibleClient: true } : {}) },
    }),
    db.chantierDocument.count({
      where: { chantierId: id, visibleClient: true, statutSignature: "A_SIGNER" },
    }),
  ]);
  if (!chantier) notFound();

  // v4.3 : équipe du chantier (membres + invitables pour la gestion)
  const membres = await listChantierMembres(id);
  const canManage = canManageMembers(
    me,
    me.isConducteur ? await isChantierMembre(me.id, id) : false
  );
  const invitables = canManage ? await listUtilisateursInvitables(id) : [];

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

  // Onglets (v4.3, doctrine « une question par écran ») : la fiche ne
  // s'empile plus, elle se feuillette. Finances réservé aux prix.
  const onglets = [
    { id: "vue", label: "Vue d'ensemble" },
    { id: "equipe", label: "Équipe" },
    { id: "documents", label: "Documents" },
    ...(me.canSeePrices ? [{ id: "finances", label: "Finances" }] : []),
  ].map((t) => ({
    ...t,
    href: t.id === "vue" ? `/chantiers/${id}` : `/chantiers/${id}?onglet=${t.id}`,
  }));
  const onglet = onglets.some((t) => t.id === ongletBrut) ? ongletBrut! : "vue";

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
            <Link href={`/messagerie/${id}`}>
              <Button size="sm">
                <MessageSquare size={14} />
                <span className="hidden sm:inline">Messagerie</span>
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
                <BoutonConfirmation
                  titre="Supprimer le chantier"
                  message={`Supprimer « ${chantier.nom} » et toutes ses données (pointages, commandes, rapports, messages) ? Cette action est définitive.`}
                  libelleConfirmer="Supprimer"
                >
                  <Trash2 size={14} />
                  <span className="hidden sm:inline">Supprimer</span>
                </BoutonConfirmation>
              </form>
            )}
          </div>
        }
      />

      {!me.isClient && <Onglets items={onglets} actif={onglet} />}

      <div className="grid grid-cols-1 gap-5">
        <div className="space-y-5">
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

          {/* GED : accès du client aux documents partagés du chantier */}
          {me.isClient && nbDocs > 0 && (
            <Link
              href={`/chantiers/${id}/documents`}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <span className="flex items-center gap-2 font-medium text-slate-800 dark:text-slate-200">
                <FolderOpen size={16} className="text-slate-400" />
                Documents ({nbDocs})
              </span>
              <span className="flex items-center gap-2">
                {nbDocsASigner > 0 && (
                  <Badge color="blue">
                    {nbDocsASigner} à signer
                  </Badge>
                )}
                <ChevronRight size={16} className="text-slate-400" />
              </span>
            </Link>
          )}
          {!me.isClient && onglet === "vue" && <Card className="max-w-2xl">
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
                  // Audit 2026-07-17 (C1) : les budgets ne quittent le serveur
                  // que pour les rôles autorisés. ChantierForm est un composant
                  // client : toute valeur passée ici part dans le payload RSC,
                  // même si le champ n'est pas rendu. L'action serveur conserve
                  // les valeurs en base quand les champs sont absents.
                  budgetEspeces: me.canSeePrices ? String(chantier.budgetEspeces) : null,
                  budgetVirement: me.canSeePrices ? String(chantier.budgetVirement) : null,
                  chefId: chantier.chefId,
                }}
                chefs={chefs}
                action={updateAction}
                submitLabel="Enregistrer"
                isAdmin={me.canSeePrices}
              />
            </CardBody>
          </Card>}

          {!me.isClient && onglet === "equipe" && <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>Équipe du chantier</CardTitle>
            </CardHeader>
            <CardBody>
              <MembresCard
                chantierId={id}
                membres={membres.map((m) => ({
                  userId: m.userId,
                  nom: m.nom,
                  role: m.role,
                }))}
                invitables={invitables.map((u) => ({
                  id: u.id,
                  name: u.name,
                  role: u.role,
                }))}
                canManage={canManage}
              />
            </CardBody>
          </Card>}

          {!me.isClient && onglet === "equipe" && <Card className="max-w-2xl">
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
                          <BoutonConfirmation
                            titre="Retirer l'équipe"
                            message={`Retirer l'équipe « ${e.nom} » de ce chantier ? Ses ouvriers ne seront plus proposés au pointage ici.`}
                            libelleConfirmer="Retirer"
                            variant="outline"
                          >
                            Retirer
                          </BoutonConfirmation>
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

          {/* Documents : les espaces documentaires du chantier + rapports */}
          {!me.isClient && onglet === "documents" && (
            <Card className="max-w-2xl">
              <CardHeader>
                <CardTitle>Espaces du chantier</CardTitle>
              </CardHeader>
              <CardBody className="!p-0">
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {[
                    {
                      href: `/chantiers/${id}/documents`,
                      label: "Documents",
                      sous:
                        nbDocs === 0
                          ? "Plans, contrats, devis, factures, PV à faire signer"
                          : `${nbDocs} document${nbDocs > 1 ? "s" : ""}${
                              nbDocsASigner > 0
                                ? ` · ${nbDocsASigner} en attente de signature`
                                : ""
                            }`,
                      Icon: FolderOpen,
                    },
                    {
                      href: `/chantiers/${id}/journal`,
                      label: "Journal",
                      sous: "Le fil historique du chantier",
                      Icon: MessageSquare,
                    },
                    {
                      href: `/chantiers/${id}/plans`,
                      label: "Plans",
                      sous: "Plans et documents graphiques",
                      Icon: FileText,
                    },
                    {
                      href: `/chantiers/${id}/rapport-hebdo`,
                      label: "Rapports hebdomadaires",
                      sous: "Synthèses envoyées au client",
                      Icon: CalendarRange,
                    },
                    {
                      href: `/chantiers/${id}/pv-reception`,
                      label: "PV de réception",
                      sous: "Réserves et signatures",
                      Icon: ClipboardCheck,
                    },
                  ].map((d) => (
                    <li key={d.href}>
                      <Link
                        href={d.href}
                        className="flex items-center gap-3 p-3 text-sm transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
                      >
                        <d.Icon size={16} className="shrink-0 text-slate-400" />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-slate-800 dark:text-slate-200">
                            {d.label}
                          </span>
                          <span className="block text-xs text-slate-500 dark:text-slate-400">
                            {d.sous}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          {/* Rapports de chantier journaliers */}
          {(me.isClient || onglet === "documents") && <Card>
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
          </Card>}

          {!me.isClient && onglet === "finances" && me.canSeePrices && <Card className="max-w-2xl">
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
                            {me.canSeePrices && (
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

          {!me.isClient && onglet === "finances" && me.canSeePrices && <Card className="max-w-2xl">
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
                            {me.canSeePrices && l.type === "LOCATION" && (
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

        {me.canSeePrices && onglet === "finances" && (
        <div className="space-y-5">
          <Link
            href={`/finance/${id}`}
            className="flex max-w-2xl items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm dark:border-brand-900 dark:bg-brand-950/40"
          >
            <span className="flex items-center gap-2 font-medium text-brand-800 dark:text-brand-300">
              <Wallet size={16} />
              Suivi financier : devis, situations, factures, encaissements
            </span>
            <ChevronRight size={16} className="text-brand-500" />
          </Link>
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>Coûts et marge estimée</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-500">Budget</div>
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  <Montant>{formatEuro(finance.budgetTotal)}</Montant>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                  <Montant>{formatEuro(finance.budgetEspeces)}</Montant> espèces ·{" "}
                  <Montant>{formatEuro(finance.budgetVirement)}</Montant> virement
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
                    <Montant>{formatEuro(finance.coutTotal)}</Montant>
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
                  <span className="font-medium"><Montant>{formatEuro(finance.coutMainOeuvre)}</Montant></span>
                </div>
                <div className="flex justify-between">
                  <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-500">
                    <ShoppingCart size={12} /> Commandes
                  </span>
                  <span className="font-medium"><Montant>{formatEuro(finance.coutCommandes)}</Montant></span>
                </div>
                <div className="flex justify-between">
                  <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-500">
                    <Truck size={12} /> Locations
                  </span>
                  <span className="font-medium"><Montant>{formatEuro(finance.coutLocations)}</Montant></span>
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
                    <Montant>{formatEuro(finance.marge)}</Montant>
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
