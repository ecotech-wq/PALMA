import Link from "next/link";
import {
  AlertTriangle,
  Banknote,
  ChevronRight,
  Clock,
  MessageSquare,
  Package,
  UserPlus,
} from "lucide-react";
import { db } from "@/lib/db";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { formatEuro } from "@/lib/utils";
import { Montant } from "@/features/discret";
import { getFinanceChantier } from "@/lib/finances-chantier";
import { TodayWidget } from "./TodayWidget";
import { ClientDashboard } from "./ClientDashboard";
import { QuickActionsBar } from "./QuickActionsBar";
import { MurDuTerrain, type PhotoTerrain } from "./MurDuTerrain";
import { AnneauAvancement } from "./AnneauAvancement";
import { requireAuth, getAccessibleChantierIds, espaceFilter } from "@/lib/auth-helpers";
import { unreadMessagerieFor } from "@/lib/read-state";

/**
 * L'accueil répond à UNE question : « qu'est-ce qui a besoin de moi
 * maintenant ? ». Le mur du terrain (photos du jour), ce qu'il y a à
 * traiter, le terrain en temps réel, les chantiers avec leur anneau
 * d'avancement. Les finances sont au second rideau : deux chiffres
 * sous mode discret et des barres de consommation SANS montants.
 * Doctrine complète : docs/maquette-accueil.
 */
export default async function DashboardPage() {
  const me = await requireAuth();

  // Les clients ont un dashboard minimal et isolé : pas de stats globales,
  // pas de finance, pas de chantiers autres que les leurs.
  if (me.isClient) {
    return <ClientDashboard userId={me.id} userName={me.name} />;
  }

  // v4.3 : chacun ne voit que SES chantiers (admin : tous).
  const accessibleIds = await getAccessibleChantierIds(me);
  // Socle espaces : le tableau de bord est borné à l'espace courant (ou aux
  // espaces de l'utilisateur en mode « tous ») en PLUS des adhésions projet.
  const idsEspace = me.espaceIds
    ? (
        await db.chantier.findMany({
          where: { espaceId: { in: me.espaceIds } },
          select: { id: true },
        })
      ).map((c) => c.id)
    : null;
  const idsVisibles =
    accessibleIds === null
      ? idsEspace
      : idsEspace === null
        ? accessibleIds
        : accessibleIds.filter((id) => idsEspace.includes(id));
  const chantierFilter =
    idsVisibles === null ? {} : { id: { in: idsVisibles } };
  const parChantierId =
    idsVisibles === null ? {} : { chantierId: { in: idsVisibles } };

  const septJours = new Date();
  septJours.setDate(septJours.getDate() - 7);
  const debutJour = new Date();
  debutJour.setHours(0, 0, 0, 0);

  const [
    chantiersListe,
    incidentsOuverts,
    incidentsCount,
    demandesCount,
    paiementsCalcules,
    locationsRetardCount,
    pendingUsersCount,
    photosMessages,
    avancements,
    unread,
  ] = await Promise.all([
    db.chantier.findMany({
      where: { statut: { in: ["EN_COURS", "PAUSE", "PLANIFIE"] }, ...chantierFilter },
      orderBy: [{ statut: "asc" }, { updatedAt: "desc" }],
      include: { _count: { select: { equipes: true } } },
    }),
    db.incident.findMany({
      where: { statut: { not: "RESOLU" }, ...parChantierId },
      select: { id: true, titre: true, chantier: { select: { nom: true } } },
      orderBy: { createdAt: "desc" },
      take: 2,
    }),
    db.incident.count({
      where: { statut: { not: "RESOLU" }, ...parChantierId },
    }),
    me.canPilot
      ? db.demandeMateriel.count({ where: { statut: "DEMANDEE" } })
      : 0,
    me.isAdmin
      ? db.paiement.aggregate({
          // Socle espaces : les paiements à verser sont bornés à l'entreprise
          // courante (sinon un admin d'espace voit le cumul de toutes).
          where: { statut: "CALCULE", ouvrier: { ...espaceFilter(me) } },
          _sum: { montantNet: true },
          _count: true,
        })
      : null,
    me.canPilot
      ? db.locationPret.count({
          where: { cloture: false, dateFinPrevue: { lt: new Date() } },
        })
      : 0,
    me.isAdmin ? db.user.count({ where: { status: "PENDING" } }) : 0,
    db.journalMessage.findMany({
      where: {
        createdAt: { gte: septJours },
        photos: { isEmpty: false },
        ...parChantierId,
      },
      select: {
        photos: true,
        chantierId: true,
        canalId: true,
        createdAt: true,
        chantier: { select: { nom: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    db.tache.groupBy({
      by: ["chantierId"],
      where: { deletedAt: null, ...parChantierId },
      _avg: { avancement: true },
    }),
    unreadMessagerieFor(me.id, accessibleIds),
  ]);

  // Mur du terrain : aujourd'hui en priorité, sinon la semaine
  const duJour = photosMessages.filter((m) => m.createdAt >= debutJour);
  const sourcePhotos = duJour.length > 0 ? duJour : photosMessages;
  const titreMur =
    duJour.length > 0 ? "Le terrain, aujourd'hui" : "Le terrain, ces derniers jours";
  const photos: PhotoTerrain[] = [];
  for (const m of sourcePhotos) {
    // Les messages d'un canal d'affaire (CRM) n'ont pas de chantier : le mur
    // du terrain ne montre que les photos des chantiers.
    if (!m.chantier || !m.chantierId) continue;
    for (const url of m.photos) {
      if (photos.length >= 12) break;
      photos.push({
        url,
        chantierNom: m.chantier.nom,
        href: m.canalId
          ? `/messagerie/${m.chantierId}?canal=${m.canalId}`
          : `/messagerie/${m.chantierId}`,
      });
    }
  }

  const avancementParChantier = new Map(
    avancements.map((a) => [a.chantierId, a._avg.avancement])
  );

  const chantiersActifsList = chantiersListe.filter((c) =>
    ["EN_COURS", "PAUSE"].includes(c.statut)
  );

  // Finances (admin + conducteur uniquement) : agrégat + consommation
  const financeByChantier = new Map<
    string,
    Awaited<ReturnType<typeof getFinanceChantier>>
  >();
  if (me.canSeePrices) {
    await Promise.all(
      chantiersActifsList.map(async (c) => {
        financeByChantier.set(c.id, await getFinanceChantier(c.id));
      })
    );
  }
  const budgetTotal = chantiersActifsList.reduce(
    (s, c) => s + (financeByChantier.get(c.id)?.budgetTotal ?? 0),
    0
  );
  const coutTotalEngage = chantiersActifsList.reduce(
    (s, c) => s + (financeByChantier.get(c.id)?.coutTotal ?? 0),
    0
  );
  const margeGlobale = budgetTotal - coutTotalEngage;
  const totalACalculer = Number(paiementsCalcules?._sum.montantNet ?? 0);

  // Lignes « à traiter » : uniquement ce qui demande une action
  const aTraiter: {
    key: string;
    dot: string;
    titre: string;
    sous: string;
    href: string;
    chip: string;
  }[] = [];
  if (incidentsCount > 0) {
    aTraiter.push({
      key: "incidents",
      dot: "bg-red-500",
      titre: `${incidentsCount} incident${incidentsCount > 1 ? "s" : ""} ouvert${incidentsCount > 1 ? "s" : ""}`,
      sous: incidentsOuverts
        .map((i) => `${i.titre} (${i.chantier?.nom ?? "sans chantier"})`)
        .join(" · "),
      href: "/incidents",
      chip: "ouvrir",
    });
  }
  if (demandesCount > 0) {
    aTraiter.push({
      key: "demandes",
      dot: "bg-amber-500",
      titre: `${demandesCount} demande${demandesCount > 1 ? "s" : ""} de matériel à valider`,
      sous: "Approuver ou refuser, la commande suit",
      href: "/demandes",
      chip: "valider",
    });
  }
  if (unread.total > 0) {
    aTraiter.push({
      key: "messages",
      dot: "bg-brand-500",
      titre: `${unread.total} message${unread.total > 1 ? "s" : ""} non lu${unread.total > 1 ? "s" : ""}`,
      sous: "Dans les fils de tes chantiers",
      href: "/messagerie",
      chip: "lire",
    });
  }
  if (locationsRetardCount > 0) {
    aTraiter.push({
      key: "locations",
      dot: "bg-amber-500",
      titre: `${locationsRetardCount} location${locationsRetardCount > 1 ? "s" : ""} en retard de retour`,
      sous: "Restituer ou prolonger",
      href: "/locations",
      chip: "traiter",
    });
  }
  if (pendingUsersCount > 0) {
    aTraiter.push({
      key: "comptes",
      dot: "bg-brand-500",
      titre: `${pendingUsersCount} compte${pendingUsersCount > 1 ? "s" : ""} en attente d'approbation`,
      sous: "Nouveaux utilisateurs inscrits",
      href: "/admin/users",
      chip: "approuver",
    });
  }

  const dateFmt = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const dateDuJour = dateFmt.format(new Date());
  const titreJour = dateDuJour.charAt(0).toUpperCase() + dateDuJour.slice(1);

  const STATUT_LABEL: Record<string, string> = {
    EN_COURS: "en cours",
    PAUSE: "en pause",
    PLANIFIE: "planifié",
  };

  const ICONE_TRAITER: Record<string, typeof AlertTriangle> = {
    incidents: AlertTriangle,
    demandes: Package,
    messages: MessageSquare,
    locations: Clock,
    comptes: UserPlus,
  };

  return (
    <div className="space-y-5">
      {/* En-tête : le jour, pas un « tableau de bord ». Les actions de
          création vivent derrière le « + », comme dans la messagerie. */}
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-slate-100">
            {titreJour}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {chantiersActifsList.length} chantier
            {chantiersActifsList.length > 1 ? "s" : ""} en cours
          </p>
        </div>
        <QuickActionsBar
          isAdmin={me.isAdmin}
          isConducteur={me.isConducteur}
          isChef={me.isChef}
        />
      </div>

      {/* Le mur du terrain : les photos du jour, chaque photo ramène à
          sa conversation */}
      <MurDuTerrain photos={photos} titre={titreMur} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* À traiter : la raison d'être de l'accueil */}
          <Card>
            <CardHeader>
              <CardTitle>À traiter</CardTitle>
            </CardHeader>
            <CardBody className="!p-0">
              {aTraiter.length === 0 ? (
                <p className="p-5 text-sm italic text-slate-500 dark:text-slate-400">
                  Rien d&apos;urgent. Le terrain tourne.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {aTraiter.map((a) => {
                    const Icone = ICONE_TRAITER[a.key] ?? AlertTriangle;
                    return (
                      <li key={a.key}>
                        <Link
                          href={a.href}
                          className="flex items-center gap-3 p-3 transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
                        >
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${a.dot}`}
                          />
                          <Icone
                            size={16}
                            className="shrink-0 text-slate-400 dark:text-slate-500"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                              {a.titre}
                            </span>
                            <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                              {a.sous}
                            </span>
                          </span>
                          <span className="shrink-0 rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
                            {a.chip}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>

          {/* Chantiers : anneau d'avancement + non-lus, rien d'autre */}
          {chantiersListe.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Chantiers</CardTitle>
              </CardHeader>
              <CardBody className="!p-0">
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {chantiersListe.map((c) => {
                    const nonLus = unread.byChantier[c.id] ?? 0;
                    const avg = avancementParChantier.get(c.id);
                    return (
                      <li key={c.id}>
                        <div className="flex items-center gap-3 p-3">
                          <AnneauAvancement
                            pct={avg === undefined || avg === null ? null : avg}
                          />
                          <Link
                            href={`/chantiers/${c.id}`}
                            className="min-w-0 flex-1"
                          >
                            <span className="block truncate text-sm font-medium text-slate-900 hover:text-brand-700 dark:text-slate-100 dark:hover:text-brand-400">
                              {c.nom}
                            </span>
                            <span className="block text-xs text-slate-500 dark:text-slate-400">
                              {STATUT_LABEL[c.statut] ?? c.statut}
                              {c._count.equipes > 0 &&
                                ` · ${c._count.equipes} équipe${c._count.equipes > 1 ? "s" : ""}`}
                            </span>
                          </Link>
                          {nonLus > 0 && (
                            <Link
                              href={`/messagerie/${c.id}`}
                              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-medium text-white"
                              title={`${nonLus} message${nonLus > 1 ? "s" : ""} non lu${nonLus > 1 ? "s" : ""}`}
                            >
                              <MessageSquare size={11} />
                              {nonLus}
                            </Link>
                          )}
                          <Link
                            href={`/chantiers/${c.id}`}
                            aria-label={`Ouvrir ${c.nom}`}
                            className="shrink-0 text-slate-300 dark:text-slate-600"
                          >
                            <ChevronRight size={16} />
                          </Link>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          {/* Le terrain en temps réel (pointage du jour) */}
          <TodayWidget />

          {/* Finances : second rideau. Deux chiffres sous mode discret,
              et des barres de consommation SANS montants (lisibles même
              masqué : la forme sans les valeurs). */}
          {me.canSeePrices && budgetTotal > 0 && (
            <Card>
              <CardHeader className="flex items-center justify-between">
                <CardTitle>Finances</CardTitle>
                <span className="text-[10px] text-slate-400 dark:text-slate-500">
                  touche M pour masquer
                </span>
              </CardHeader>
              <CardBody>
                <div className="flex items-start gap-6">
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Marge active
                    </div>
                    <div
                      className={`text-xl font-bold ${
                        margeGlobale < 0
                          ? "text-red-600"
                          : "text-emerald-600 dark:text-emerald-500"
                      }`}
                    >
                      <Montant>
                        {margeGlobale >= 0 ? "+" : ""}
                        {formatEuro(margeGlobale)}
                      </Montant>
                    </div>
                  </div>
                  {me.isAdmin && totalACalculer > 0 && (
                    <Link href="/paie" className="group">
                      <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                        <Banknote size={12} /> Paie à verser
                      </div>
                      <div className="text-xl font-bold text-slate-900 group-hover:text-brand-700 dark:text-slate-100">
                        <Montant>{formatEuro(totalACalculer)}</Montant>
                      </div>
                    </Link>
                  )}
                </div>

                {/* Consommation par chantier : la forme sans les valeurs */}
                <div className="mt-4 space-y-2">
                  {chantiersActifsList.map((c) => {
                    const f = financeByChantier.get(c.id);
                    if (!f || f.budgetTotal <= 0) return null;
                    const pct = Math.min(
                      100,
                      Math.round((f.coutTotal / f.budgetTotal) * 100)
                    );
                    const over = f.coutTotal > f.budgetTotal;
                    return (
                      <Link
                        key={c.id}
                        href={`/chantiers/${c.id}`}
                        className="block"
                        title={`${c.nom} : ${pct} % du budget consommé`}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="truncate text-slate-600 dark:text-slate-300">
                            {c.nom}
                          </span>
                          <span
                            className={`ml-2 shrink-0 tabular-nums ${
                              over
                                ? "text-red-600"
                                : pct >= 80
                                  ? "text-amber-600"
                                  : "text-slate-400 dark:text-slate-500"
                            }`}
                          >
                            {pct} %
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className={`h-full rounded-full ${
                              over
                                ? "bg-red-500"
                                : pct >= 80
                                  ? "bg-amber-500"
                                  : "bg-brand-500"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
