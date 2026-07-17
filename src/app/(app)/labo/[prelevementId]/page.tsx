import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Plus, Printer, Trash2, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-helpers";
import { classerEssai } from "@/lib/labo-calc";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Field, Select, Textarea } from "@/components/ui/Input";
import { ResettingForm } from "@/components/ResettingForm";
import { BoutonConfirmation } from "@/components/ui/BoutonConfirmation";
import { formatDate } from "@/lib/utils";
import {
  EcheanceBadge,
  StatutEssaiBadge,
  VerdictBadge,
  fmtValeur,
} from "../labo-labels";
import {
  ajouterEssai,
  saisirResultat,
  annulerEssai,
  supprimerPrelevement,
} from "../actions";

// ─── Fiche d'un prélèvement (béton chantier ou R&D formulation) ──────────────
// Entête d'identification, éprouvettes codées, essais avec échéances et
// verdicts, saisie de résultat par essai, ajout d'essai, lien vers le rapport
// d'essai imprimable (logique ISO/IEC 17025 § 7.8). Mobile-first : formulaires
// compacts repliés dans des <details> (motif finance/[chantierId]).

const today = () => new Date().toISOString().slice(0, 10);

function aujourdHuiUTC(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export default async function PrelevementLaboPage({
  params,
}: {
  params: Promise<{ prelevementId: string }>;
}) {
  const { prelevementId } = await params;
  const me = await requireAuth();
  // Garde de page (audit 2026-07-17) : même verrou que le layout labo,
  // qui ne protège pas la page elle-même (rendu parallèle Next.js).
  if (!me.canPilot) redirect("/aujourdhui");

  const p = await db.prelevementLabo.findUnique({
    where: { id: prelevementId },
    include: {
      chantier: { select: { id: true, nom: true } },
      formulation: { select: { id: true, nom: true, campagne: true } },
      eprouvettes: { orderBy: { code: "asc" } },
      essais: {
        include: {
          eprouvette: { select: { code: true } },
          equipement: { select: { nom: true } },
        },
        orderBy: [{ echeance: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  if (!p) notFound();
  // Frontière d'espace, même convention que les actions (null = hérité).
  if (me.espaceIds && !me.espaceIds.includes(p.espaceId)) notFound();

  const equipements = await db.equipementLabo.findMany({
    where: { espaceId: p.espaceId },
    select: { id: true, nom: true },
    orderBy: { nom: "asc" },
  });

  const aujourdHui = aujourdHuiUTC();
  const contexte = p.chantier
    ? `Chantier ${p.chantier.nom}`
    : p.formulation
      ? `Formulation ${p.formulation.nom}${
          p.formulation.campagne ? ` (campagne ${p.formulation.campagne})` : ""
        }`
      : "Interne";

  // La suppression emporte éprouvettes et essais (cascade Prisma) : on
  // confirme côté interface puis on revient au tableau de bord.
  async function supprimerEtRevenir() {
    "use server";
    await supprimerPrelevement(prelevementId);
    redirect("/labo");
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={p.reference}
        backHref="/labo"
        description={
          <>
            {p.materiau}
            {p.classePrescrite
              ? ` · classe prescrite ${p.classePrescrite}`
              : ""}
            {" · "}
            {contexte}
            {" · prélevé le "}
            {formatDate(p.datePrelevement)}
            {p.preleveur ? ` par ${p.preleveur}` : ""}
          </>
        }
        action={
          <Link href={`/labo/${p.id}/rapport/print`}>
            <Button variant="outline" size="sm">
              <Printer size={14} />
              <span className="hidden sm:inline">
                Rapport d&apos;essai (imprimer)
              </span>
              <span className="sm:hidden">Rapport</span>
            </Button>
          </Link>
        }
      />

      {(p.origine || p.note) && (
        <Card>
          <CardBody className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
            {p.origine && (
              <p>
                <span className="font-medium">Origine :</span> {p.origine}
              </p>
            )}
            {p.note && <p className="whitespace-pre-wrap">{p.note}</p>}
          </CardBody>
        </Card>
      )}

      {/* ── Éprouvettes ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Éprouvettes ({p.eprouvettes.length})</CardTitle>
        </CardHeader>
        <CardBody className="!p-0">
          {p.eprouvettes.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
              Aucune éprouvette (les essais portent sur le prélèvement
              lui-même).
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {p.eprouvettes.map((ep) => (
                <li
                  key={ep.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
                >
                  <span className="font-mono text-sm font-medium text-slate-900 dark:text-slate-100">
                    {ep.code}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {[
                      ep.geometrie,
                      ep.dateFabrication
                        ? `fabriquée le ${formatDate(ep.dateFabrication)}`
                        : null,
                      ep.conditionsCure,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* ── Essais ──────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Essais ({p.essais.length})</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          {p.essais.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Aucun essai. Ajoutez-en un ci-dessous (norme ou protocole
              libre).
            </p>
          ) : (
            <ul className="space-y-2">
              {p.essais.map((e) => {
                const constat = classerEssai(
                  { statut: e.statut, echeance: e.echeance },
                  aujourdHui
                );
                const ouvert =
                  e.statut === "PLANIFIE" || e.statut === "EN_COURS";
                const estCompression = /compression/i.test(e.type);
                return (
                  <li
                    key={e.id}
                    className={`rounded-lg border border-slate-200 p-3 dark:border-slate-800 ${
                      e.statut === "ANNULE" ? "opacity-60" : ""
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-slate-800 dark:text-slate-200">
                          {e.type}
                          {e.eprouvette ? (
                            <span className="ml-1 font-mono text-xs text-slate-500 dark:text-slate-400">
                              {e.eprouvette.code}
                            </span>
                          ) : null}
                        </p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {e.norme ?? "Protocole interne"}
                          {e.echeance
                            ? ` · échéance ${formatDate(e.echeance)}`
                            : ""}
                          {e.equipement ? ` · ${e.equipement.nom}` : ""}
                        </p>
                      </div>
                      {ouvert && constat && <EcheanceBadge constat={constat} />}
                      <StatutEssaiBadge statut={e.statut} />
                      {ouvert && (
                        <form action={annulerEssai.bind(null, e.id)}>
                          <Button
                            type="submit"
                            variant="ghost"
                            size="icon"
                            aria-label="Annuler l'essai"
                          >
                            <XCircle size={14} />
                          </Button>
                        </form>
                      )}
                    </div>

                    {/* Résultat validé : valeur, incertitude, verdict */}
                    {e.statut === "VALIDE" && e.valeur !== null && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2 dark:border-slate-800">
                        <span className="font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                          {fmtValeur(Number(e.valeur))} {e.unite}
                          {e.incertitude ? ` ± ${e.incertitude}` : ""}
                        </span>
                        {e.seuil !== null && (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            seuil {fmtValeur(Number(e.seuil))} {e.unite}
                          </span>
                        )}
                        <VerdictBadge conforme={e.conforme} />
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {e.dateRealisation
                            ? `réalisé le ${formatDate(e.dateRealisation)}`
                            : ""}
                          {e.operateur ? ` par ${e.operateur}` : ""}
                        </span>
                      </div>
                    )}

                    {e.note && (
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        {e.note}
                      </p>
                    )}

                    {/* Saisie du résultat (essai ouvert) */}
                    {ouvert && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-medium text-brand-700 dark:text-brand-400">
                          + Saisir le résultat
                        </summary>
                        <ResettingForm
                          action={saisirResultat}
                          successMessage="Résultat enregistré"
                          className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5"
                        >
                          <input type="hidden" name="essaiId" value={e.id} />
                          <Field label="Valeur" required>
                            <Input
                              name="valeur"
                              type="number"
                              step="0.0001"
                              inputMode="decimal"
                              required
                            />
                          </Field>
                          <Field label="Unité" required>
                            <Input
                              name="unite"
                              defaultValue={estCompression ? "MPa" : ""}
                              placeholder="MPa, %, W/m.K..."
                              required
                            />
                          </Field>
                          <Field label="Incertitude">
                            <Input name="incertitude" placeholder="0,5 MPa" />
                          </Field>
                          <Field label="Date" required>
                            <Input
                              name="dateRealisation"
                              type="date"
                              defaultValue={today()}
                              required
                            />
                          </Field>
                          <Field label="Opérateur">
                            <Input name="operateur" placeholder="Nom" />
                          </Field>
                          <div className="col-span-2 sm:col-span-5">
                            <Button type="submit" size="sm">
                              Valider le résultat
                            </Button>
                          </div>
                        </ResettingForm>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {/* Ajout d'essai : norme OU protocole libre */}
          <details className="rounded-lg border border-slate-200 dark:border-slate-800">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-brand-700 dark:text-brand-400">
              + Ajouter un essai
            </summary>
            <div className="border-t border-slate-200 p-3 dark:border-slate-800">
              <ResettingForm
                action={ajouterEssai}
                successMessage="Essai ajouté"
                className="grid grid-cols-1 gap-3 sm:grid-cols-2"
              >
                <input type="hidden" name="prelevementId" value={p.id} />
                <Field label="Type d'essai" required>
                  <Input
                    name="type"
                    placeholder="Compression, granulométrie, teneur en eau..."
                    required
                  />
                </Field>
                <Field label="Norme" hint="Ex. NF EN 12390-3, NF P94-068">
                  <Input name="norme" placeholder="NF EN 12390-3" />
                </Field>
                <Field label="Éprouvette">
                  <Select name="eprouvetteId" defaultValue="">
                    <option value="">Aucune (sur le prélèvement)</option>
                    {p.eprouvettes.map((ep) => (
                      <option key={ep.id} value={ep.id}>
                        {ep.code}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Échéance">
                  <Input name="echeance" type="date" />
                </Field>
                <Field label="Équipement">
                  <Select name="equipementId" defaultValue="">
                    <option value="">Aucun</option>
                    {equipements.map((eq) => (
                      <option key={eq.id} value={eq.id}>
                        {eq.nom}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="sm:col-span-2">
                  <Field
                    label="Protocole libre"
                    hint="Indispensable pour la terre crue et les biosourcés sans norme dédiée"
                  >
                    <Textarea
                      name="protocole"
                      placeholder="Mode opératoire : préparation, conditions, mesure..."
                    />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Button type="submit">
                    <Plus size={16} /> Ajouter l&apos;essai
                  </Button>
                </div>
              </ResettingForm>
            </div>
          </details>
        </CardBody>
      </Card>

      {/* ── Suppression du prélèvement ──────────────────────────────────── */}
      <form action={supprimerEtRevenir} className="flex justify-end">
        <BoutonConfirmation
          titre="Supprimer le prélèvement"
          message={`Supprimer « ${p.reference} » ? Ses éprouvettes et ses essais seront supprimés avec lui.`}
          libelleConfirmer="Supprimer"
          variant="outline"
        >
          <Trash2 size={14} /> Supprimer le prélèvement
        </BoutonConfirmation>
      </form>
    </div>
  );
}
