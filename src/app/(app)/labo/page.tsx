import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CalendarClock,
  ChevronRight,
  FlaskConical,
  Plus,
  TestTubes,
} from "lucide-react";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import {
  requireAuth,
  espaceFilter,
  getAccessibleChantierIds,
} from "@/lib/auth-helpers";
import {
  classerEssai,
  MAX_EPROUVETTES_PRELEVEMENT,
  PREAVIS_ECHEANCE_ESSAI_JOURS,
} from "@/lib/labo-calc";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Field, Select, Textarea } from "@/components/ui/Input";
import { ResettingForm } from "@/components/ResettingForm";
import { formatDate } from "@/lib/utils";
import {
  CompteurTile,
  EcheanceBadge,
  StatutEssaiBadge,
  fmtValeur,
} from "./labo-labels";
import {
  creerPrelevementBeton,
  creerPrelevementRD,
  creerFormulation,
  creerEquipement,
} from "./actions";

// ─── Tableau de bord du laboratoire (OptimusLab) ─────────────────────────────
// Deux flux sur un même noyau (docs/CONCEPTION-LABO.md) : essais chantier
// (béton, échéances d'écrasement J+7 / J+28) et R&D par formulation (terre
// crue, biosourcés). Tout est bordé par l'espace (espaceFilter) ; le filtre
// chantier passe par un query param validé côté serveur, comme le planning.
// Mobile-first : le contenu prime, les formulaires de création sont repliés
// dans des <details> (motif finance).

const JOUR_MS = 24 * 3600 * 1000;

type Param = string | string[] | undefined;

/** Premier élément d'un query param éventuellement répété, "" -> undefined. */
function premier(v: Param): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s || undefined;
}

function aujourdHuiUTC(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

const today = () => new Date().toISOString().slice(0, 10);

export default async function LaboPage({
  searchParams,
}: {
  searchParams: Promise<{ chantier?: Param; campagne?: Param }>;
}) {
  const sp = await searchParams;
  const me = await requireAuth();
  // Garde de page (audit 2026-07-17) : le layout labo a la garde canPilot
  // mais ne protège pas la page elle-même (rendu parallèle Next.js).
  if (!me.canPilot) redirect("/aujourdhui");

  // Filtre chantier (GET) validé côté serveur : un id hors périmètre est
  // ignoré, même convention que le planning.
  const accessibles = await getAccessibleChantierIds(me);
  const chantierBrut = premier(sp.chantier);
  const chantierSel =
    chantierBrut && (accessibles === null || accessibles.includes(chantierBrut))
      ? chantierBrut
      : undefined;

  const aujourdHui = aujourdHuiUTC();
  const debutMois = new Date(
    Date.UTC(aujourdHui.getUTCFullYear(), aujourdHui.getUTCMonth(), 1)
  );

  const prelevementFiltre = {
    ...espaceFilter(me),
    ...(chantierSel ? { chantierId: chantierSel } : {}),
  };
  // Essais « ouverts » : seuls PLANIFIE et EN_COURS sont surveillés (même
  // périmètre que classerEssai et que le moteur de relances ESSAI_ECHU).
  const essaisOuverts: Prisma.EssaiLaboWhereInput = {
    statut: { in: ["PLANIFIE", "EN_COURS"] },
    prelevement: prelevementFiltre,
  };

  const [
    nbEchus,
    nbAEcheance,
    nbOuverts,
    nbNonConformesMois,
    echeances,
    prelevements,
    formulations,
    chantiersOptions,
    equipements,
  ] = await Promise.all([
    db.essaiLabo.count({
      where: { ...essaisOuverts, echeance: { lt: aujourdHui } },
    }),
    db.essaiLabo.count({
      where: {
        ...essaisOuverts,
        echeance: {
          gte: aujourdHui,
          lte: new Date(
            aujourdHui.getTime() + PREAVIS_ECHEANCE_ESSAI_JOURS * JOUR_MS
          ),
        },
      },
    }),
    db.essaiLabo.count({ where: essaisOuverts }),
    db.essaiLabo.count({
      where: {
        conforme: false,
        dateRealisation: { gte: debutMois },
        prelevement: prelevementFiltre,
      },
    }),
    db.essaiLabo.findMany({
      where: { ...essaisOuverts, echeance: { not: null } },
      select: {
        id: true,
        type: true,
        norme: true,
        statut: true,
        echeance: true,
        eprouvette: { select: { code: true } },
        prelevement: {
          select: {
            id: true,
            reference: true,
            chantier: { select: { nom: true } },
            formulation: { select: { nom: true } },
          },
        },
      },
      orderBy: { echeance: "asc" },
      take: 30,
    }),
    db.prelevementLabo.findMany({
      where: prelevementFiltre,
      select: {
        id: true,
        reference: true,
        materiau: true,
        datePrelevement: true,
        classePrescrite: true,
        chantier: { select: { nom: true } },
        formulation: { select: { nom: true } },
        _count: { select: { eprouvettes: true, essais: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    db.formulationLabo.findMany({
      where: espaceFilter(me),
      select: {
        id: true,
        nom: true,
        campagne: true,
        description: true,
        _count: { select: { prelevements: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.chantier.findMany({
      where: {
        ...espaceFilter(me),
        ...(accessibles ? { id: { in: accessibles } } : {}),
        statut: { in: ["PLANIFIE", "EN_COURS", "PAUSE"] },
      },
      select: { id: true, nom: true },
      orderBy: { nom: "asc" },
    }),
    db.equipementLabo.findMany({
      where: espaceFilter(me),
      select: { id: true, nom: true, dateEtalonnage: true },
      orderBy: { nom: "asc" },
    }),
  ]);

  // ── Comparatif R&D : une campagne, les essais VALIDÉS côte à côte ─────────
  const campagnes = [
    ...new Set(
      formulations
        .map((f) => f.campagne)
        .filter((c): c is string => Boolean(c))
    ),
  ];
  const campagneBrut = premier(sp.campagne);
  const campagneSel =
    campagneBrut && campagnes.includes(campagneBrut)
      ? campagneBrut
      : campagnes[0];
  const formulationsCampagne = formulations.filter(
    (f) => f.campagne === campagneSel
  );

  const essaisCampagne = campagneSel
    ? await db.essaiLabo.findMany({
        where: {
          statut: "VALIDE",
          prelevement: {
            ...espaceFilter(me),
            formulation: { campagne: campagneSel },
          },
        },
        select: {
          type: true,
          unite: true,
          valeur: true,
          conforme: true,
          prelevement: { select: { formulationId: true } },
        },
        orderBy: { dateRealisation: "asc" },
      })
    : [];

  // Matrice type d'essai (ligne) x formulation (colonne). Tri chronologique
  // ascendant : la dernière écriture gagne, la cellule porte donc l'essai
  // validé le plus récent.
  const lignes = new Map<
    string,
    Map<string, { texte: string; conforme: boolean | null }>
  >();
  for (const e of essaisCampagne) {
    const fid = e.prelevement.formulationId;
    if (!fid || e.valeur === null) continue;
    const cle = e.unite ? `${e.type} (${e.unite})` : e.type;
    let parFormulation = lignes.get(cle);
    if (!parFormulation) {
      parFormulation = new Map();
      lignes.set(cle, parFormulation);
    }
    parFormulation.set(fid, {
      texte: fmtValeur(Number(e.valeur)),
      conforme: e.conforme,
    });
  }
  const lignesComparatif = Array.from(lignes.entries());

  return (
    <div className="space-y-4">
      <PageHeader
        title="Laboratoire"
        description="Essais chantier (échéances d'écrasement) et campagnes R&D par formulation. Les relances surveillent les essais échus."
      />

      {/* Tuiles compteurs : une ligne de 2 sur téléphone, 4 au-delà */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CompteurTile
          libelle="Essais échus"
          valeur={nbEchus}
          ton={nbEchus > 0 ? "retard" : "ok"}
          note="Échéance dépassée"
        />
        <CompteurTile
          libelle="À échéance"
          valeur={nbAEcheance}
          ton={nbAEcheance > 0 ? "alerte" : "neutre"}
          note={`Sous ${PREAVIS_ECHEANCE_ESSAI_JOURS} jours`}
        />
        <CompteurTile
          libelle="Essais en cours"
          valeur={nbOuverts}
          note="Planifiés ou en cours"
        />
        <CompteurTile
          libelle="Non conformes"
          valeur={nbNonConformesMois}
          ton={nbNonConformesMois > 0 ? "retard" : "ok"}
          note="Ce mois-ci"
        />
      </div>

      {/* ── Échéances d'écrasement ──────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <CalendarClock size={15} className="text-slate-500" />
              Échéances d&apos;écrasement
            </span>
          </CardTitle>
          <form method="get" className="flex items-center gap-2">
            {campagneSel && (
              <input type="hidden" name="campagne" value={campagneSel} />
            )}
            <Select
              name="chantier"
              defaultValue={chantierSel ?? ""}
              aria-label="Filtrer par chantier"
              className="h-9 w-auto max-w-[180px] py-1 text-sm"
            >
              <option value="">Tous les chantiers</option>
              {chantiersOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="outline" size="sm">
              Filtrer
            </Button>
          </form>
        </CardHeader>
        <CardBody className="!p-0">
          {echeances.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
              Aucun essai ouvert avec échéance
              {chantierSel ? " sur ce chantier" : ""}.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {echeances.map((e) => {
                const constat = classerEssai(
                  { statut: e.statut, echeance: e.echeance },
                  aujourdHui
                );
                return (
                  <li key={e.id}>
                    <Link
                      href={`/labo/${e.prelevement.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-slate-800 dark:text-slate-200">
                          {e.type}
                          {e.eprouvette ? (
                            <span className="ml-1 font-mono text-xs text-slate-500 dark:text-slate-400">
                              {e.eprouvette.code}
                            </span>
                          ) : (
                            <span className="ml-1 text-xs text-slate-500 dark:text-slate-400">
                              {e.prelevement.reference}
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                          {e.prelevement.chantier?.nom ??
                            e.prelevement.formulation?.nom ??
                            "Interne"}
                          {e.norme ? ` · ${e.norme}` : ""}
                          {" · échéance "}
                          {formatDate(e.echeance)}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {constat ? (
                          <EcheanceBadge constat={constat} />
                        ) : (
                          <StatutEssaiBadge statut={e.statut} />
                        )}
                        <ChevronRight size={16} className="text-slate-400" />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* ── Prélèvements récents ────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <TestTubes size={15} className="text-slate-500" />
              Prélèvements récents
            </span>
          </CardTitle>
        </CardHeader>
        <CardBody className="!p-0">
          {prelevements.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
              Aucun prélèvement. Créez le premier ci-dessous : le flux béton
              planifie tout seul les écrasements à J+7 et J+28.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {prelevements.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/labo/${p.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                        {p.reference}
                        <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">
                          {p.materiau}
                          {p.classePrescrite ? ` ${p.classePrescrite}` : ""}
                        </span>
                      </span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                        {p.chantier?.nom ?? p.formulation?.nom ?? "Interne"}
                        {" · prélevé le "}
                        {formatDate(p.datePrelevement)}
                        {" · "}
                        {p._count.eprouvettes} épr. · {p._count.essais} essai
                        {p._count.essais > 1 ? "s" : ""}
                      </span>
                    </span>
                    <ChevronRight
                      size={16}
                      className="shrink-0 text-slate-400"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* ── Formulations R&D : liste + comparatif par campagne ──────────── */}
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <FlaskConical size={15} className="text-slate-500" />
              Formulations R&D
            </span>
          </CardTitle>
          {campagnes.length > 1 && (
            <form method="get" className="flex items-center gap-2">
              {chantierSel && (
                <input type="hidden" name="chantier" value={chantierSel} />
              )}
              <Select
                name="campagne"
                defaultValue={campagneSel ?? ""}
                aria-label="Choisir une campagne"
                className="h-9 w-auto max-w-[180px] py-1 text-sm"
              >
                {campagnes.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
              <Button type="submit" variant="outline" size="sm">
                Comparer
              </Button>
            </form>
          )}
        </CardHeader>
        <CardBody className="space-y-4">
          {formulations.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Aucune formulation. Une formulation regroupe les prélèvements
              d&apos;une même recette (terre crue, chanvre, fibres...) et une
              campagne permet de comparer plusieurs recettes entre elles.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {formulations.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-slate-800 dark:text-slate-200">
                      {f.nom}
                      {f.campagne ? (
                        <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                          campagne {f.campagne}
                        </span>
                      ) : null}
                    </span>
                    {f.description && (
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                        {f.description}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                    {f._count.prelevements} prélèv.
                  </span>
                </li>
              ))}
            </ul>
          )}

          {campagneSel && formulationsCampagne.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Comparatif de la campagne « {campagneSel} » (essais validés)
              </p>
              {lignesComparatif.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Aucun essai validé sur cette campagne pour l&apos;instant.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
                        <th className="py-2 pr-3">Essai</th>
                        {formulationsCampagne.map((f) => (
                          <th key={f.id} className="py-2 pr-3 text-right">
                            {f.nom}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {lignesComparatif.map(([type, parFormulation]) => (
                        <tr key={type}>
                          <td className="py-2 pr-3 text-slate-700 dark:text-slate-300">
                            {type}
                          </td>
                          {formulationsCampagne.map((f) => {
                            const cellule = parFormulation.get(f.id);
                            return (
                              <td
                                key={f.id}
                                className={`py-2 pr-3 text-right font-mono tabular-nums ${
                                  cellule?.conforme === false
                                    ? "text-red-600 dark:text-red-400"
                                    : "text-slate-800 dark:text-slate-200"
                                }`}
                              >
                                {cellule?.texte ?? "-"}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      {/* ── Créations : formulaires repliés (motif finance) ─────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Créer</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          {/* Prélèvement béton (flux chantier) */}
          <details className="rounded-lg border border-slate-200 dark:border-slate-800">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-brand-700 dark:text-brand-400">
              + Prélèvement béton (chantier)
            </summary>
            <div className="border-t border-slate-200 p-3 dark:border-slate-800">
              <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                Les éprouvettes sont codées automatiquement (REF-A, REF-B...)
                et les écrasements NF EN 12390-3 sont planifiés à J+7
                (information) et J+28 (normatif), avec relance si l&apos;essai
                est échu.
              </p>
              <ResettingForm
                action={creerPrelevementBeton}
                successMessage="Prélèvement créé, écrasements planifiés"
                className="grid grid-cols-1 gap-3 sm:grid-cols-2"
              >
                <Field label="Chantier" required>
                  <Select name="chantierId" required defaultValue="">
                    <option value="" disabled>
                      Choisir un chantier...
                    </option>
                    {chantiersOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nom}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Référence" required hint="Unique, ex. BET-014">
                  <Input name="reference" placeholder="BET-014" required />
                </Field>
                <Field label="Date de prélèvement" required>
                  <Input
                    name="datePrelevement"
                    type="date"
                    defaultValue={today()}
                    required
                  />
                </Field>
                <Field label="Classe prescrite" required hint="Ex. C25/30">
                  <Input name="classePrescrite" placeholder="C25/30" required />
                </Field>
                <Field
                  label="Nombre d'éprouvettes"
                  hint="3 = une à 7 j, deux au normatif à 28 j"
                >
                  <Input
                    name="nbEprouvettes"
                    type="number"
                    min={1}
                    max={MAX_EPROUVETTES_PRELEVEMENT}
                    defaultValue={3}
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Préleveur">
                  <Input name="preleveur" placeholder="Nom du préleveur" />
                </Field>
                <Field label="Géométrie" hint="Vide = cylindre 16x32 cm">
                  <Input name="geometrie" placeholder="Cylindre 16x32 cm" />
                </Field>
                <Field label="Conditions de cure" hint="Vide = EN 12390-2">
                  <Input
                    name="conditionsCure"
                    placeholder="Cure normalisée EN 12390-2"
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Button type="submit">
                    <Plus size={16} /> Créer le prélèvement
                  </Button>
                </div>
              </ResettingForm>
            </div>
          </details>

          {/* Prélèvement R&D (flux formulation) */}
          <details className="rounded-lg border border-slate-200 dark:border-slate-800">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-brand-700 dark:text-brand-400">
              + Prélèvement R&D (formulation)
            </summary>
            <div className="border-t border-slate-200 p-3 dark:border-slate-800">
              <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                Rattaché à une formulation existante ou créée à la volée. Les
                essais s&apos;enchaînent ensuite à la main depuis la fiche
                (granulométrie, VBS, teneur en eau, compression, retrait,
                conductivité...).
              </p>
              <ResettingForm
                action={creerPrelevementRD}
                successMessage="Prélèvement R&D créé"
                className="grid grid-cols-1 gap-3 sm:grid-cols-2"
              >
                <Field label="Formulation existante">
                  <Select name="formulationId" defaultValue="">
                    <option value="">Aucune (en créer une)</option>
                    {formulations.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nom}
                        {f.campagne ? ` (${f.campagne})` : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="Nouvelle formulation"
                  hint="Ignorée si une formulation est choisie"
                >
                  <Input
                    name="nouvelleFormulationNom"
                    placeholder="Terre-chanvre T3"
                  />
                </Field>
                <Field label="Campagne (nouvelle formulation)">
                  <Input
                    name="nouvelleFormulationCampagne"
                    placeholder="Campagne 2026-T3"
                  />
                </Field>
                <Field label="Matériau" required>
                  <Input
                    name="materiau"
                    placeholder="Terre crue, béton de chanvre..."
                    required
                  />
                </Field>
                <Field label="Référence" required hint="Unique, ex. RD-021">
                  <Input name="reference" placeholder="RD-021" required />
                </Field>
                <Field label="Date de prélèvement" required>
                  <Input
                    name="datePrelevement"
                    type="date"
                    defaultValue={today()}
                    required
                  />
                </Field>
                <Field label="Origine">
                  <Input
                    name="origine"
                    placeholder="Carrière, gisement, malaxeur..."
                  />
                </Field>
                <Field label="Préleveur">
                  <Input name="preleveur" placeholder="Nom du préleveur" />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Note">
                    <Textarea
                      name="note"
                      placeholder="Contexte, observations au prélèvement..."
                    />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Button type="submit">
                    <Plus size={16} /> Créer le prélèvement R&D
                  </Button>
                </div>
              </ResettingForm>
            </div>
          </details>

          {/* Formulation seule */}
          <details className="rounded-lg border border-slate-200 dark:border-slate-800">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-brand-700 dark:text-brand-400">
              + Formulation
            </summary>
            <div className="border-t border-slate-200 p-3 dark:border-slate-800">
              <ResettingForm
                action={creerFormulation}
                successMessage="Formulation créée"
                className="grid grid-cols-1 gap-3 sm:grid-cols-2"
              >
                <Field label="Nom" required>
                  <Input name="nom" placeholder="Terre-chanvre T3" required />
                </Field>
                <Field
                  label="Campagne"
                  hint="Les formulations d'une même campagne se comparent"
                >
                  <Input name="campagne" placeholder="Campagne 2026-T3" />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Description">
                    <Textarea
                      name="description"
                      placeholder="Objectif de la formulation, usage visé..."
                    />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Composition">
                    <Textarea
                      name="composition"
                      placeholder="Dosages : terre 70 %, chènevotte 25 %, chaux 5 %..."
                    />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Button type="submit">
                    <Plus size={16} /> Créer la formulation
                  </Button>
                </div>
              </ResettingForm>
            </div>
          </details>

          {/* Équipement (traçabilité métrologique) */}
          <details className="rounded-lg border border-slate-200 dark:border-slate-800">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-brand-700 dark:text-brand-400">
              + Équipement
            </summary>
            <div className="border-t border-slate-200 p-3 dark:border-slate-800">
              {equipements.length > 0 && (
                <ul className="mb-3 divide-y divide-slate-100 text-sm dark:divide-slate-800">
                  {equipements.map((eq) => (
                    <li
                      key={eq.id}
                      className="flex items-center justify-between gap-3 py-1.5"
                    >
                      <span className="truncate text-slate-800 dark:text-slate-200">
                        {eq.nom}
                      </span>
                      <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                        {eq.dateEtalonnage
                          ? `étalonné le ${formatDate(eq.dateEtalonnage)}`
                          : "étalonnage non renseigné"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <ResettingForm
                action={creerEquipement}
                successMessage="Équipement ajouté"
                className="grid grid-cols-1 gap-3 sm:grid-cols-2"
              >
                <Field label="Nom" required>
                  <Input
                    name="nom"
                    placeholder="Presse 3000 kN, balance, étuve..."
                    required
                  />
                </Field>
                <Field label="Dernier étalonnage">
                  <Input name="dateEtalonnage" type="date" />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Note">
                    <Input
                      name="note"
                      placeholder="N° de série, prestataire d'étalonnage..."
                    />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Button type="submit">
                    <Plus size={16} /> Ajouter l&apos;équipement
                  </Button>
                </div>
              </ResettingForm>
            </div>
          </details>
        </CardBody>
      </Card>
    </div>
  );
}
