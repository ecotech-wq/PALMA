import Link from "next/link";
import {
  Hammer,
  Users,
  Wrench,
  HardHat,
  AlertTriangle,
  ArrowLeftRight,
  Plus,
  Banknote,
  CheckSquare,
  ShoppingCart,
  Truck,
} from "lucide-react";
import { db } from "@/lib/db";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CommandeStatutBadge } from "@/app/(app)/commandes/CommandeStatutBadge";
import { formatEuro, formatDate } from "@/lib/utils";
import { getFinanceChantier } from "@/lib/finances-chantier";
import { ChantierFinanceCard } from "./ChantierFinanceCard";

export default async function DashboardPage() {
  const debutMois = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const today = new Date();

  const [
    chantiersActifs,
    chantiersTotal,
    equipes,
    ouvriersActifs,
    materielTotal,
    materielSorti,
    materielHS,
    sortiesActives,
    chantiersListe,
    pointagesMois,
    avancesNonReglees,
    paiementsCalcules,
    outilsRestants,
    locationsEnRetard,
    commandesEnLivraison,
    locationsEnCoursTotal,
  ] = await Promise.all([
    db.chantier.count({ where: { statut: { in: ["EN_COURS", "PAUSE"] } } }),
    db.chantier.count(),
    db.equipe.count(),
    db.ouvrier.count({ where: { actif: true } }),
    db.materiel.count(),
    db.materiel.count({ where: { statut: "SORTI" } }),
    db.materiel.count({ where: { statut: { in: ["HS", "PERDU"] } } }),
    db.sortieMateriel.findMany({
      where: { dateRetour: null },
      include: {
        materiel: { select: { nomCommun: true } },
        equipe: { select: { nom: true } },
        chantier: { select: { nom: true } },
      },
      orderBy: { dateSortie: "desc" },
      take: 5,
    }),
    db.chantier.findMany({
      where: { statut: { in: ["EN_COURS", "PAUSE", "PLANIFIE"] } },
      orderBy: [{ statut: "asc" }, { updatedAt: "desc" }],
      include: { _count: { select: { equipes: true } } },
    }),
    db.pointage.aggregate({
      where: { date: { gte: debutMois } },
      _sum: { joursTravailles: true },
    }),
    db.avance.aggregate({
      where: { reglee: false },
      _sum: { montant: true },
      _count: true,
    }),
    db.paiement.aggregate({
      where: { statut: "CALCULE" },
      _sum: { montantNet: true },
      _count: true,
    }),
    db.outilPersonnel.aggregate({
      where: { solde: false },
      _sum: { restantDu: true },
      _count: true,
    }),
    db.locationPret.findMany({
      where: { cloture: false, dateFinPrevue: { lt: today } },
      select: { id: true, designation: true, dateFinPrevue: true, fournisseurNom: true },
      orderBy: { dateFinPrevue: "asc" },
      take: 5,
    }),
    db.commande.findMany({
      where: { statut: { in: ["COMMANDEE", "EN_LIVRAISON"] } },
      include: { chantier: { select: { nom: true } } },
      orderBy: { dateLivraisonPrevue: "asc" },
      take: 5,
    }),
    db.locationPret.aggregate({
      where: { cloture: false, type: "LOCATION" },
      _sum: { coutTotal: true },
    }),
  ]);

  // Calcule les finances pour chaque chantier visible (actifs + planifiés)
  const financeByChantier = new Map<string, Awaited<ReturnType<typeof getFinanceChantier>>>();
  await Promise.all(
    chantiersListe.map(async (c) => {
      const f = await getFinanceChantier(c.id);
      financeByChantier.set(c.id, f);
    })
  );

  const chantiersActifsList = chantiersListe.filter((c) =>
    ["EN_COURS", "PAUSE"].includes(c.statut)
  );
  const chantiersPlanifies = chantiersListe.filter((c) => c.statut === "PLANIFIE");

  // Agrégat global pour le bandeau du haut
  const budgetTotal = chantiersActifsList.reduce(
    (s, c) => s + (financeByChantier.get(c.id)?.budgetTotal ?? 0),
    0
  );
  const coutTotalEngage = chantiersActifsList.reduce(
    (s, c) => s + (financeByChantier.get(c.id)?.coutTotal ?? 0),
    0
  );

  const cards = [
    {
      label: "Chantiers actifs",
      value: chantiersActifs,
      sub: `${chantiersTotal} au total`,
      icon: Hammer,
      color: "text-orange-600 bg-orange-50",
      href: "/chantiers",
    },
    {
      label: "Équipes",
      value: equipes,
      sub: ouvriersActifs ? `${ouvriersActifs} ouvriers actifs` : "—",
      icon: Users,
      color: "text-brand-600 bg-brand-50",
      href: "/equipes",
    },
    {
      label: "Matériel",
      value: materielTotal,
      sub:
        materielSorti > 0
          ? `${materielSorti} sorti${materielSorti > 1 ? "s" : ""}`
          : "tout au dépôt",
      icon: Wrench,
      color: "text-purple-600 bg-purple-50",
      href: "/materiel",
    },
    {
      label: "Ouvriers",
      value: ouvriersActifs,
      sub: "actifs",
      icon: HardHat,
      color: "text-green-600 bg-green-50",
      href: "/ouvriers",
    },
  ];

  const joursMois = Number(pointagesMois._sum.joursTravailles ?? 0);
  const totalAvances = Number(avancesNonReglees._sum.montant ?? 0);
  const totalACalculer = Number(paiementsCalcules._sum.montantNet ?? 0);
  const totalOutilsRestant = Number(outilsRestants._sum.restantDu ?? 0);
  const totalLocations = Number(locationsEnCoursTotal._sum.coutTotal ?? 0);
  const consommePct =
    budgetTotal > 0 ? Math.min(100, Math.round((coutTotalEngage / budgetTotal) * 100)) : 0;
  const isOver = coutTotalEngage > budgetTotal && budgetTotal > 0;
  const margeGlobale = budgetTotal - coutTotalEngage;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Tableau de bord
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Vue d&apos;ensemble de ton activité
          </p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {cards.map(({ label, value, sub, icon: Icon, color, href }) => (
          <Link
            key={label}
            href={href}
            className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-brand-300 hover:shadow-sm transition p-4 md:p-5"
          >
            <div className={`inline-flex p-2 rounded-lg ${color}`}>
              <Icon size={20} />
            </div>
            <div className="mt-3 text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-100">
              {value}
            </div>
            <div className="text-xs md:text-sm text-slate-500 dark:text-slate-400">
              {label}
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{sub}</div>
          </Link>
        ))}
      </div>

      {/* Budget global agrégé sur tous les chantiers actifs */}
      {budgetTotal > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Budget global — chantiers actifs</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Budget total</div>
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {formatEuro(budgetTotal)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Engagé</div>
                <div
                  className={`text-2xl font-bold ${
                    isOver ? "text-red-600" : "text-slate-900 dark:text-slate-100"
                  }`}
                >
                  {formatEuro(coutTotalEngage)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Marge restante</div>
                <div
                  className={`text-2xl font-bold ${
                    margeGlobale < 0 ? "text-red-600" : "text-green-600 dark:text-green-500"
                  }`}
                >
                  {margeGlobale >= 0 ? "+" : ""}
                  {formatEuro(margeGlobale)}
                </div>
              </div>
            </div>
            <div className="mt-3 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  isOver ? "bg-red-500" : consommePct >= 80 ? "bg-amber-500" : "bg-brand-500"
                }`}
                style={{ width: `${consommePct}%` }}
              />
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex justify-between">
              <span>
                {chantiersActifsList.length} chantier
                {chantiersActifsList.length > 1 ? "s" : ""} actif
                {chantiersActifsList.length > 1 ? "s" : ""}
              </span>
              <span>{consommePct}% consommé</span>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Détail budget par chantier */}
      {chantiersActifsList.length > 0 && (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Détail par chantier</CardTitle>
            <Link href="/chantiers/nouveau">
              <Button size="sm" variant="outline">
                <Plus size={14} /> Nouveau
              </Button>
            </Link>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
              {chantiersActifsList.map((c) => {
                const f = financeByChantier.get(c.id);
                if (!f) return null;
                return <ChantierFinanceCard key={c.id} chantier={c} finance={f} />;
              })}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Chantiers planifiés (si présents) — petite liste, pas de finance */}
      {chantiersPlanifies.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Chantiers planifiés ({chantiersPlanifies.length})</CardTitle>
          </CardHeader>
          <CardBody className="!p-0">
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {chantiersPlanifies.map((c) => {
                const budget = Number(c.budgetEspeces) + Number(c.budgetVirement);
                return (
                  <li key={c.id}>
                    <Link
                      href={`/chantiers/${c.id}`}
                      className="flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                          {c.nom}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Budget prévu : {formatEuro(budget)}
                        </div>
                      </div>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {c._count.equipes} équipe{c._count.equipes > 1 ? "s" : ""}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      )}

      {/* Vide ou pas de chantier actif */}
      {chantiersActifsList.length === 0 && chantiersPlanifies.length === 0 && (
        <Card>
          <CardBody className="text-center py-8">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
              Aucun chantier en cours.
            </p>
            <Link href="/chantiers/nouveau">
              <Button>
                <Plus size={16} /> Créer ton premier chantier
              </Button>
            </Link>
          </CardBody>
        </Card>
      )}

      {/* Mini cards : pointage, à verser, locations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
        <Link
          href="/pointage"
          className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-brand-300 hover:shadow-sm transition p-4"
        >
          <div className="flex items-center gap-2 text-brand-600">
            <CheckSquare size={18} />
            <span className="text-sm font-medium">Pointage du mois</span>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
            {joursMois}{" "}
            <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
              jours-homme
            </span>
          </div>
        </Link>

        <Link
          href="/paie"
          className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-brand-300 hover:shadow-sm transition p-4"
        >
          <div className="flex items-center gap-2 text-amber-600">
            <Banknote size={18} />
            <span className="text-sm font-medium">À verser (paiements calculés)</span>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
            {formatEuro(totalACalculer)}
          </div>
          <div className="text-xs text-slate-400 dark:text-slate-500">
            {paiementsCalcules._count} paiement{paiementsCalcules._count > 1 ? "s" : ""} en
            attente
          </div>
        </Link>

        <Link
          href="/locations"
          className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-brand-300 hover:shadow-sm transition p-4"
        >
          <div className="flex items-center gap-2 text-purple-600">
            <Truck size={18} />
            <span className="text-sm font-medium">Locations en cours</span>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
            {formatEuro(totalLocations)}
          </div>
          <div className="text-xs text-slate-400 dark:text-slate-500">
            {totalAvances > 0 && `Avances : ${formatEuro(totalAvances)} · `}
            {totalOutilsRestant > 0 && `Outils dus : ${formatEuro(totalOutilsRestant)}`}
            {totalAvances === 0 && totalOutilsRestant === 0 && "Aucune avance ouverte"}
          </div>
        </Link>
      </div>

      {/* Cartes secondaires */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Commandes à venir</CardTitle>
            <Link href="/commandes">
              <Button size="sm" variant="outline">
                <ShoppingCart size={14} /> Voir
              </Button>
            </Link>
          </CardHeader>
          <CardBody className="!p-0">
            {commandesEnLivraison.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
                Aucune commande en attente.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {commandesEnLivraison.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/commandes/${c.id}`}
                      className="flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate text-slate-900 dark:text-slate-100">
                          {c.fournisseur}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {c.chantier.nom}
                          {c.dateLivraisonPrevue &&
                            ` · livraison ${formatDate(c.dateLivraisonPrevue)}`}
                        </div>
                      </div>
                      <CommandeStatutBadge statut={c.statut} />
                      <div className="font-semibold w-20 text-right shrink-0">
                        {formatEuro(c.coutTotal.toString())}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Matériel sorti</CardTitle>
            <Link href="/sorties">
              <Button size="sm" variant="outline">
                <ArrowLeftRight size={14} /> Sorties
              </Button>
            </Link>
          </CardHeader>
          <CardBody className="!p-0">
            {sortiesActives.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
                Tout le matériel est au dépôt.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {sortiesActives.map((s) => (
                  <li key={s.id} className="p-3 text-sm flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate text-slate-900 dark:text-slate-100">
                        {s.materiel.nomCommun}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {s.equipe?.nom || s.chantier?.nom || "—"} ·{" "}
                        {formatDate(s.dateSortie)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {locationsEnRetard.length > 0 && (
          <Card className="border-red-200 dark:border-red-900">
            <CardHeader className="flex items-center justify-between bg-red-50 dark:bg-red-950">
              <CardTitle className="text-red-800 dark:text-red-300">
                Locations en retard
              </CardTitle>
              <Link href="/locations">
                <Button size="sm" variant="outline">
                  Voir tout
                </Button>
              </Link>
            </CardHeader>
            <CardBody className="!p-0">
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {locationsEnRetard.map((l) => (
                  <li key={l.id}>
                    <Link
                      href={`/locations/${l.id}`}
                      className="flex items-center gap-3 p-3 hover:bg-red-50 dark:hover:bg-red-950 text-sm"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate text-slate-900 dark:text-slate-100">
                          {l.designation}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {l.fournisseurNom} · à rendre {formatDate(l.dateFinPrevue)}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}
      </div>

      {materielHS > 0 && (
        <Card className="border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950">
          <CardBody className="flex items-center gap-3">
            <AlertTriangle className="text-amber-600 shrink-0" size={20} />
            <div className="flex-1 text-sm text-amber-900 dark:text-amber-100">
              <span className="font-medium">{materielHS}</span> matériel(s) hors service ou
              perdu(s).
            </div>
            <Link href="/materiel?statut=HS">
              <Button size="sm" variant="outline">
                Voir
              </Button>
            </Link>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
