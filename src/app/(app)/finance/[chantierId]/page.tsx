import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, Trash2, ExternalLink, FileText, Hammer } from "lucide-react";
import { db } from "@/lib/db";
import { requireAuth, requireChantierAccess } from "@/lib/auth-helpers";
import { getSuiviChantier } from "@/lib/suivi-commercial";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Field, Select } from "@/components/ui/Input";
import { ResettingForm } from "@/components/ResettingForm";
import { Montant } from "@/features/discret";
import { formatEuro, formatDate } from "@/lib/utils";
import {
  KpiTile,
  StatutBadge,
  STATUT_DEVIS,
  STATUT_EMISSION,
  STATUT_REGLEMENT,
  STATUT_SITUATION,
  STATUT_MARCHE,
  STATUT_RETENUE,
  TYPE_FACTURE,
  SOURCE_DOC,
} from "../suivi-labels";
import { ChangerStatut } from "../ChangerStatut";
import { getConstatsRelances } from "../relances-data";
import { RelancesProjetCard } from "../RelancesCard";
import {
  creerMarche,
  majStatutMarche,
  creerDevis,
  majStatutDevis,
  supprimerDevis,
  creerFacture,
  majStatutEmissionFacture,
  supprimerFacture,
  ajouterEncaissement,
  supprimerEncaissement,
  creerSituation,
  majStatutSituation,
  facturerSituation,
  supprimerSituation,
  majStatutRetenue,
} from "../actions";

// ─── Détail du suivi financier d'un projet ───────────────────────────────────
// Un écran par projet : marché, devis, situations, factures + encaissements,
// retenue. Mobile-first : le contenu prime, les formulaires de saisie sont
// repliés dans des <details> (« le chrome se déplie à la demande »).

const today = () => new Date().toISOString().slice(0, 10);

export default async function FinanceChantierPage({
  params,
}: {
  params: Promise<{ chantierId: string }>;
}) {
  const { chantierId } = await params;
  const me = await requireAuth();
  await requireChantierAccess(me, chantierId);

  const chantier = await db.chantier.findUnique({
    where: { id: chantierId },
    select: { id: true, nom: true, type: true, adresse: true },
  });
  if (!chantier) notFound();
  const estEtude = chantier.type === "ETUDE";

  // Constats de relance bornés à CE projet (mêmes dérivations que le cockpit).
  const constatsRelances = await getConstatsRelances({
    espaceIds: me.espaceIds,
    chantierId,
  });

  const [marche, suivi, devis, situations, factures, retenue, phases, clients] =
    await Promise.all([
      db.marche.findFirst({
        where: { chantierId },
        orderBy: { createdAt: "asc" },
      }),
      getSuiviChantier(chantierId),
      db.devis.findMany({
        where: { chantierId },
        orderBy: { createdAt: "desc" },
      }),
      db.situationTravaux.findMany({
        where: { chantierId },
        orderBy: { numeroOrdre: "asc" },
        include: { phaseEtude: { select: { code: true } } },
      }),
      db.facture.findMany({
        where: { chantierId },
        orderBy: { createdAt: "desc" },
        include: {
          encaissements: { orderBy: { dateEncaissement: "desc" } },
        },
      }),
      db.retenueGarantie.findFirst({ where: { chantierId } }),
      estEtude
        ? db.phaseEtude.findMany({
            where: { chantierId },
            orderBy: { ordre: "asc" },
            select: { id: true, code: true, libelle: true, montantVendu: true },
          })
        : Promise.resolve([]),
      db.user.findMany({
        where: { role: "CLIENT", chantiersClient: { some: { id: chantierId } } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Suivi financier — ${chantier.nom}`}
        description={chantier.adresse ?? undefined}
        backHref="/finance"
        action={
          <Link href={estEtude ? `/be/${chantier.id}` : `/chantiers/${chantier.id}`}>
            <Button variant="outline" size="sm">
              {estEtude ? <FileText size={14} /> : <Hammer size={14} />}
              <span className="hidden sm:inline">Ouvrir le projet</span>
            </Button>
          </Link>
        }
      />

      {/* KPI du projet */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiTile libelle="Marché HT" valeur={suivi.montantMarcheHT} />
        <KpiTile libelle="Facturé HT" valeur={suivi.cumulFactureHT} note={`${suivi.tauxAvancementFinancier}% du marché`} />
        <KpiTile libelle="Encaissé" valeur={suivi.cumulEncaisse} ton="ok" />
        <KpiTile
          libelle="Reste à encaisser"
          valeur={suivi.resteAEncaisser}
          ton={suivi.resteAEncaisser > 0 ? "alerte" : "neutre"}
        />
        <KpiTile
          libelle="En retard"
          valeur={suivi.montantEnRetard}
          ton={suivi.montantEnRetard > 0 ? "retard" : "ok"}
          note={`${suivi.facturesEnRetard} facture(s)`}
        />
        <KpiTile
          libelle="Retenue en cours"
          valeur={suivi.retenueEnCours}
          ton={suivi.retenueEnCours > 0 ? "alerte" : "neutre"}
        />
      </div>

      {/* Relances du projet : rendu seulement s'il y a au moins un constat */}
      <RelancesProjetCard constats={constatsRelances} />

      {/* ── Marché ──────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Marché (contrat)</CardTitle>
        </CardHeader>
        <CardBody>
          {marche ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 dark:text-slate-100">
                    {marche.reference}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {marche.maitreOuvrageNom
                      ? `MOA : ${marche.maitreOuvrageNom} · `
                      : ""}
                    Retenue {Number(marche.tauxRetenueGarantie)}% · paiement{" "}
                    {marche.delaiPaiementJours} j
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    <Montant>{formatEuro(Number(marche.montantCourantHT))}</Montant>
                  </span>
                  <ChangerStatut
                    id={marche.id}
                    valeur={marche.statut}
                    action={majStatutMarche}
                    options={Object.entries(STATUT_MARCHE).map(([value, d]) => ({
                      value,
                      label: d.label,
                    }))}
                    ariaLabel="Statut du marché"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div>
              <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
                Aucun marché suivi sur ce projet. Créez-le pour établir les
                situations et suivre le facturé contre le vendu.
              </p>
              <ResettingForm
                action={creerMarche}
                successMessage="Marché créé"
                className="grid grid-cols-1 gap-3 sm:grid-cols-2"
              >
                <input type="hidden" name="chantierId" value={chantier.id} />
                <input
                  type="hidden"
                  name="modeFacturation"
                  value={estEtude ? "JALON_PHASE" : "SITUATION_TRAVAUX"}
                />
                <Field label="Référence du marché" required>
                  <Input name="reference" placeholder="Marché 2026-014" required />
                </Field>
                <Field label="Montant initial HT">
                  <Input name="montantInitialHT" type="number" step="0.01" min="0" inputMode="decimal" defaultValue="0" />
                </Field>
                <Field label="Maître d'ouvrage (texte)">
                  <Input name="maitreOuvrageNom" placeholder="Nom du client / MOA" />
                </Field>
                {clients.length > 0 && (
                  <Field label="Client LYNX (facultatif)">
                    <Select name="clientUserId" defaultValue="">
                      <option value="">— Aucun —</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                <Field label="Retenue de garantie (%)" hint={estEtude ? "0 en bureau d'études" : "5 % en général"}>
                  <Input name="tauxRetenueGarantie" type="number" step="0.5" min="0" max="10" defaultValue={estEtude ? "0" : "5"} />
                </Field>
                <Field label="Délai de paiement (jours)">
                  <Input name="delaiPaiementJours" type="number" min="0" max="120" defaultValue="30" />
                </Field>
                <div className="sm:col-span-2">
                  <Button type="submit">
                    <Plus size={16} /> Créer le marché
                  </Button>
                </div>
              </ResettingForm>
            </div>
          )}
        </CardBody>
      </Card>

      {/* ── Devis ───────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Devis</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          {devis.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Aucun devis suivi.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {devis.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-800 dark:text-slate-200">
                      {d.objet}
                      {d.referenceExterne ? (
                        <span className="text-slate-400"> · {d.referenceExterne}</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {SOURCE_DOC[d.source]}
                      {d.lienExterne ? (
                        <a href={d.lienExterne} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-brand-600">
                          <ExternalLink size={11} /> pièce
                        </a>
                      ) : null}
                    </p>
                  </div>
                  <span className="text-sm font-medium tabular-nums text-slate-700 dark:text-slate-300">
                    <Montant>{formatEuro(Number(d.montantTTC))}</Montant>
                  </span>
                  <ChangerStatut
                    id={d.id}
                    valeur={d.statut}
                    action={majStatutDevis}
                    demanderMotifSur={["REFUSE"]}
                    options={Object.entries(STATUT_DEVIS).map(([value, def]) => ({ value, label: def.label }))}
                    ariaLabel="Statut du devis"
                  />
                  <form action={supprimerDevis.bind(null, d.id)}>
                    <Button type="submit" variant="ghost" size="icon" aria-label="Supprimer le devis">
                      <Trash2 size={14} />
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <details className="rounded-lg border border-slate-200 dark:border-slate-800">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-brand-700 dark:text-brand-400">
              + Suivre un devis
            </summary>
            <div className="border-t border-slate-200 p-3 dark:border-slate-800">
              <ResettingForm action={creerDevis} successMessage="Devis ajouté" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input type="hidden" name="chantierId" value={chantier.id} />
                <Field label="Objet" required>
                  <Input name="objet" placeholder="Devis gros œuvre" required />
                </Field>
                <Field label="Source">
                  <Select name="source" defaultValue={estEtude ? "ODOO" : "CONSTRUCTOR"}>
                    {Object.entries(SOURCE_DOC).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Référence externe">
                  <Input name="referenceExterne" placeholder="N° dans Odoo / Constructor" />
                </Field>
                <Field label="Lien (facultatif)">
                  <Input name="lienExterne" type="url" placeholder="https://..." />
                </Field>
                <Field label="Montant HT">
                  <Input name="montantHT" type="number" step="0.01" min="0" inputMode="decimal" defaultValue="0" />
                </Field>
                <Field label="Montant TTC" hint="Vide = repris du HT">
                  <Input name="montantTTC" type="number" step="0.01" min="0" inputMode="decimal" />
                </Field>
                <Field label="Date d'émission">
                  <Input name="dateEmission" type="date" defaultValue={today()} />
                </Field>
                <Field label="Validité jusqu'au">
                  <Input name="dateValidite" type="date" />
                </Field>
                <div className="sm:col-span-2">
                  <Button type="submit"><Plus size={16} /> Ajouter</Button>
                </div>
              </ResettingForm>
            </div>
          </details>
        </CardBody>
      </Card>

      {/* ── Situations de travaux / jalons ──────────────────────────────── */}
      {marche && (
        <Card>
          <CardHeader>
            <CardTitle>
              {estEtude ? "Jalons d'honoraires" : "Situations de travaux"}
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            {situations.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Aucune situation établie.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
                      <th className="py-2 pr-3">N°</th>
                      <th className="py-2 pr-3 text-right">Avanc.</th>
                      <th className="py-2 pr-3 text-right">Période HT</th>
                      <th className="py-2 pr-3 text-right">Net à payer</th>
                      <th className="py-2 pr-3">Statut</th>
                      <th className="py-2 pr-0" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {situations.map((s) => (
                      <tr key={s.id}>
                        <td className="py-2 pr-3 font-medium text-slate-900 dark:text-slate-100">
                          {s.numeroOrdre}
                          {s.phaseEtude ? (
                            <span className="ml-1 text-xs text-slate-400">{s.phaseEtude.code}</span>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {Number(s.avancementCumulePct)}%
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          <Montant>{formatEuro(Number(s.montantPeriodeHT))}</Montant>
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums font-medium">
                          <Montant>{formatEuro(Number(s.netAPayerPeriode))}</Montant>
                        </td>
                        <td className="py-2 pr-3">
                          {s.statut === "FACTUREE" || s.statut === "PAYEE" || s.statut === "PARTIELLEMENT_PAYEE" ? (
                            <StatutBadge def={STATUT_SITUATION[s.statut]} />
                          ) : (
                            <ChangerStatut
                              id={s.id}
                              valeur={s.statut}
                              action={majStatutSituation}
                              options={["BROUILLON", "TRANSMISE", "VISEE_MOE", "ACCEPTEE", "CONTESTEE"].map((v) => ({ value: v, label: STATUT_SITUATION[v].label }))}
                              ariaLabel="Statut de la situation"
                            />
                          )}
                        </td>
                        <td className="py-2 pr-0 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {!s.factureId && s.statut !== "BROUILLON" && (
                              <form action={facturerSituation.bind(null, s.id)}>
                                <Button type="submit" variant="outline" size="sm">
                                  Facturer
                                </Button>
                              </form>
                            )}
                            {!s.factureId && (
                              <form action={supprimerSituation.bind(null, s.id)}>
                                <Button type="submit" variant="ghost" size="icon" aria-label="Supprimer la situation">
                                  <Trash2 size={14} />
                                </Button>
                              </form>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <details className="rounded-lg border border-slate-200 dark:border-slate-800">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-brand-700 dark:text-brand-400">
                + Établir une situation
              </summary>
              <div className="border-t border-slate-200 p-3 dark:border-slate-800">
                <ResettingForm action={creerSituation} successMessage="Situation établie" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input type="hidden" name="chantierId" value={chantier.id} />
                  <input type="hidden" name="base" value={estEtude ? "BASE_FORFAIT_PHASE" : "BASE_TRAVAUX"} />
                  {estEtude && (
                    <Field label="Phase d'honoraires" required>
                      <Select name="phaseEtudeId" required defaultValue="">
                        <option value="" disabled>Choisir une phase…</option>
                        {phases.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.code} — {p.libelle} ({formatEuro(Number(p.montantVendu))})
                          </option>
                        ))}
                      </Select>
                    </Field>
                  )}
                  <Field label="Avancement cumulé (%)" required hint="Le montant de la période se calcule tout seul">
                    <Input name="avancementCumulePct" type="number" step="0.01" min="0" max="100" inputMode="decimal" required />
                  </Field>
                  <Field label="Période du">
                    <Input name="periodeDebut" type="date" defaultValue={today()} required />
                  </Field>
                  <Field label="au">
                    <Input name="periodeFin" type="date" defaultValue={today()} required />
                  </Field>
                  <Field label="Date d'établissement">
                    <Input name="dateEtablissement" type="date" defaultValue={today()} required />
                  </Field>
                  <Field label="Taux de TVA (%)">
                    <Input name="tauxTVA" type="number" step="0.1" min="0" max="30" defaultValue="20" />
                  </Field>
                  <Field label="Acompte à imputer">
                    <Input name="imputationAcompte" type="number" step="0.01" min="0" inputMode="decimal" defaultValue="0" />
                  </Field>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                      <input type="checkbox" name="autoliquidation" className="rounded border-slate-400 text-brand-600" />
                      Autoliquidation TVA
                    </label>
                  </div>
                  <div className="sm:col-span-2">
                    <Button type="submit"><Plus size={16} /> Établir</Button>
                  </div>
                </ResettingForm>
              </div>
            </details>
          </CardBody>
        </Card>
      )}

      {/* ── Factures & encaissements ────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Factures et encaissements</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          {factures.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Aucune facture suivie.
            </p>
          ) : (
            <ul className="space-y-2">
              {factures.map((f) => {
                const du = Number(f.montantTTC) - Number(f.montantPaye);
                return (
                  <li key={f.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-slate-800 dark:text-slate-200">
                          <span className="text-xs text-slate-400">{TYPE_FACTURE[f.type]} · </span>
                          {f.objet || f.referenceExterne || "Facture"}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {f.dateEcheance ? `échéance ${formatDate(f.dateEcheance)}` : "échéance non définie"}
                          {" · "}payé{" "}
                          <Montant>{formatEuro(Number(f.montantPaye))}</Montant>
                          {" / "}
                          <Montant>{formatEuro(Number(f.montantTTC))}</Montant>
                        </p>
                      </div>
                      <StatutBadge def={STATUT_EMISSION[f.statutEmission]} />
                      <StatutBadge def={STATUT_REGLEMENT[f.statutReglement]} />
                      <ChangerStatut
                        id={f.id}
                        valeur={f.statutEmission}
                        action={majStatutEmissionFacture}
                        options={Object.entries(STATUT_EMISSION).map(([v, d]) => ({ value: v, label: d.label }))}
                        ariaLabel="Statut d'émission"
                      />
                      {f.encaissements.length === 0 && (
                        <form action={supprimerFacture.bind(null, f.id)}>
                          <Button type="submit" variant="ghost" size="icon" aria-label="Supprimer la facture">
                            <Trash2 size={14} />
                          </Button>
                        </form>
                      )}
                    </div>

                    {f.encaissements.length > 0 && (
                      <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2 dark:border-slate-800">
                        {f.encaissements.map((e) => (
                          <li key={e.id} className="flex items-center justify-between gap-2 text-xs">
                            <span className="text-slate-500 dark:text-slate-400">
                              {formatDate(e.dateEncaissement)} · {e.mode}
                              {e.reference ? ` · ${e.reference}` : ""}
                            </span>
                            <span className="flex items-center gap-2">
                              <span className="tabular-nums text-slate-700 dark:text-slate-300">
                                <Montant>{formatEuro(Number(e.montant))}</Montant>
                              </span>
                              <form action={supprimerEncaissement.bind(null, e.id)}>
                                <Button type="submit" variant="ghost" size="icon" aria-label="Supprimer l'encaissement">
                                  <Trash2 size={12} />
                                </Button>
                              </form>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {du > 0.005 && f.statutEmission !== "ANNULEE" && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-medium text-brand-700 dark:text-brand-400">
                          + Enregistrer un encaissement (reste{" "}
                          <Montant>{formatEuro(du)}</Montant>)
                        </summary>
                        <ResettingForm action={ajouterEncaissement} successMessage="Encaissement enregistré" className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <input type="hidden" name="factureId" value={f.id} />
                          <Field label="Montant">
                            <Input name="montant" type="number" step="0.01" min="0.01" inputMode="decimal" defaultValue={du.toFixed(2)} required />
                          </Field>
                          <Field label="Date">
                            <Input name="dateEncaissement" type="date" defaultValue={today()} required />
                          </Field>
                          <Field label="Mode">
                            <Select name="mode" defaultValue="VIREMENT">
                              <option value="VIREMENT">Virement</option>
                              <option value="CHEQUE">Chèque</option>
                              <option value="CB">Carte</option>
                              <option value="EFFET">Effet</option>
                              <option value="ESPECES">Espèces</option>
                            </Select>
                          </Field>
                          <div className="flex items-end">
                            <Button type="submit" className="w-full">Encaisser</Button>
                          </div>
                        </ResettingForm>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <details className="rounded-lg border border-slate-200 dark:border-slate-800">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-brand-700 dark:text-brand-400">
              + Suivre une facture externe
            </summary>
            <div className="border-t border-slate-200 p-3 dark:border-slate-800">
              <ResettingForm action={creerFacture} successMessage="Facture ajoutée" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input type="hidden" name="chantierId" value={chantier.id} />
                <Field label="Type">
                  <Select name="type" defaultValue={estEtude ? "HONORAIRES" : "SITUATION"}>
                    {Object.entries(TYPE_FACTURE).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Objet">
                  <Input name="objet" placeholder="Facture n°..." />
                </Field>
                <Field label="Référence externe">
                  <Input name="referenceExterne" placeholder="N° dans Odoo / Constructor" />
                </Field>
                <Field label="Lien (facultatif)">
                  <Input name="lienExterne" type="url" placeholder="https://..." />
                </Field>
                <Field label="Montant HT">
                  <Input name="montantHT" type="number" step="0.01" inputMode="decimal" defaultValue="0" />
                </Field>
                <Field label="Montant TTC" hint="Vide = repris du HT">
                  <Input name="montantTTC" type="number" step="0.01" inputMode="decimal" />
                </Field>
                <Field label="Date d'émission" hint="L'échéance se calcule depuis le marché">
                  <Input name="dateEmission" type="date" defaultValue={today()} />
                </Field>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <input type="checkbox" name="autoliquidation" className="rounded border-slate-400 text-brand-600" />
                    Autoliquidation TVA
                  </label>
                </div>
                <div className="sm:col-span-2">
                  <Button type="submit"><Plus size={16} /> Ajouter</Button>
                </div>
              </ResettingForm>
            </div>
          </details>
        </CardBody>
      </Card>

      {/* ── Retenue de garantie ─────────────────────────────────────────── */}
      {retenue && (
        <Card>
          <CardHeader>
            <CardTitle>Retenue de garantie</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  <Montant>{formatEuro(Number(retenue.montantRetenuCumul))}</Montant>
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Taux {Number(retenue.tauxPct)}%
                  {retenue.dateEcheanceLiberation
                    ? ` · libération prévue le ${formatDate(retenue.dateEcheanceLiberation)}`
                    : ""}
                </p>
              </div>
              <ChangerStatut
                id={retenue.id}
                valeur={retenue.statut}
                action={majStatutRetenue}
                demanderMotifSur={["OPPOSITION"]}
                options={Object.entries(STATUT_RETENUE).map(([v, d]) => ({ value: v, label: d.label }))}
                ariaLabel="Statut de la retenue"
              />
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
