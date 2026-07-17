import { redirect } from "next/navigation";
import { FileSignature, ExternalLink } from "lucide-react";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatEuro, formatDate } from "@/lib/utils";
import {
  StatutBadge,
  STATUT_DEVIS,
  STATUT_SITUATION,
  STATUT_EMISSION,
  STATUT_REGLEMENT,
  TYPE_FACTURE,
} from "../finance/suivi-labels";
import { SignBoxClient } from "./SignBoxClient";
import { signerDevisClient, signerSituationClient } from "./actions";
import { SignerDocumentBox } from "../chantiers/[id]/documents/SignerDocumentBox";
import { LABEL_CATEGORIE } from "../chantiers/[id]/documents/categories";

// ─── Volet contractuel et financier du client ───────────────────────────────
// Le client voit et signe SES devis et situations (demandes d'acompte sur
// avancement), et consulte SES factures. Chaque bloc n'apparaît que si l'admin
// a ouvert le drapeau correspondant. Aucun coût ni marge du chantier n'est
// exposé : uniquement les pièces qui le concernent.

export default async function MesDocumentsPage() {
  const me = await requireAuth();
  if (!me.isClient) redirect("/aujourdhui");

  const user = await db.user.findUnique({
    where: { id: me.id },
    select: {
      showDevis: true,
      showSituations: true,
      showFactures: true,
      chantiersClient: { select: { id: true } },
    },
  });
  const chantierIds = (user?.chantiersClient ?? []).map((c) => c.id);
  const showDevis = user?.showDevis ?? false;
  const showSituations = user?.showSituations ?? false;
  const showFactures = user?.showFactures ?? false;
  const rienOuvert = !showDevis && !showSituations && !showFactures;

  const [devis, situations, factures, docsChantier] = await Promise.all([
    showDevis && chantierIds.length > 0
      ? db.devis.findMany({
          where: {
            chantierId: { in: chantierIds },
            statut: { not: "BROUILLON" },
            // Devis adressé à ce client, ou sans destinataire désigné : on ne
            // montre pas à A le devis nominatif de B (même chantier partagé).
            OR: [{ clientUserId: null }, { clientUserId: me.id }],
          },
          include: { chantier: { select: { nom: true } } },
          orderBy: { createdAt: "desc" },
        })
      : [],
    showSituations && chantierIds.length > 0
      ? db.situationTravaux.findMany({
          where: {
            chantierId: { in: chantierIds },
            statut: { not: "BROUILLON" },
          },
          include: { chantier: { select: { nom: true } } },
          orderBy: [{ chantierId: "asc" }, { numeroOrdre: "asc" }],
        })
      : [],
    showFactures && chantierIds.length > 0
      ? db.facture.findMany({
          where: {
            chantierId: { in: chantierIds },
            statutEmission: { in: ["EMISE", "ENVOYEE"] },
            type: { not: "AVOIR" },
          },
          include: { chantier: { select: { nom: true } } },
          orderBy: { dateEmission: "desc" },
        })
      : [],
    // GED chantier : les documents ouverts au client (visibilité par pièce,
    // indépendante des drapeaux devis / situations / factures).
    chantierIds.length > 0
      ? db.chantierDocument.findMany({
          where: { chantierId: { in: chantierIds }, visibleClient: true },
          include: { chantier: { select: { nom: true } } },
          orderBy: { createdAt: "desc" },
        })
      : [],
  ]);

  const aSigner =
    devis.filter((d) => !d.signatureClientUrl && (d.statut === "ENVOYE" || d.statut === "RELANCE")).length +
    situations.filter((s) => !s.signatureClientUrl && (s.statut === "TRANSMISE" || s.statut === "VISEE_MOE")).length +
    docsChantier.filter((d) => d.statutSignature === "A_SIGNER").length;
  const rienAVoir = rienOuvert && docsChantier.length === 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Mes documents"
        description="Vos devis, situations d'avancement et factures. Signez les documents en attente."
      />

      {rienAVoir ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={FileSignature}
              title="Aucun document partagé"
              description="Votre interlocuteur ne vous a pas encore ouvert l'accès à vos devis, situations, factures ou documents de chantier. Il peut le faire depuis votre compte."
            />
          </CardBody>
        </Card>
      ) : (
        <>
          {aSigner > 0 && (
            <Card className="border-brand-200 bg-brand-50 dark:border-brand-900 dark:bg-brand-950/40">
              <CardBody className="text-sm text-brand-800 dark:text-brand-300">
                {aSigner} document{aSigner > 1 ? "s" : ""} en attente de votre
                signature.
              </CardBody>
            </Card>
          )}

          {/* Documents de chantier (GED) : contrats, plans, PV... partagés */}
          {docsChantier.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Documents de chantier</CardTitle>
              </CardHeader>
              <CardBody className="!p-0">
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {docsChantier.map((d) => (
                    <li key={d.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <a
                            href={d.fichier}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block truncate text-sm font-medium text-slate-900 hover:underline dark:text-slate-100"
                          >
                            {d.nom}
                          </a>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {d.chantier?.nom} · {LABEL_CATEGORIE[d.categorie]} ·
                            ajouté le {formatDate(d.createdAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {d.statutSignature === "A_SIGNER" && (
                            <Badge color="blue">À signer</Badge>
                          )}
                          {d.statutSignature === "SIGNE" && (
                            <Badge color="green">Signé</Badge>
                          )}
                          <a
                            href={d.fichier}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-600"
                            aria-label="Ouvrir le document"
                          >
                            <ExternalLink size={14} />
                          </a>
                        </div>
                      </div>
                      {(d.statutSignature === "A_SIGNER" ||
                        d.statutSignature === "SIGNE") && (
                        <SignerDocumentBox
                          documentId={d.id}
                          fichier={d.fichier}
                          signeUrl={d.signatureClientUrl}
                          signeLe={d.signatureClientLe}
                          signePar={d.signatureClientPar}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          {/* Devis */}
          {showDevis && (
            <Card>
              <CardHeader>
                <CardTitle>Devis</CardTitle>
              </CardHeader>
              <CardBody className="!p-0">
                {devis.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
                    Aucun devis à afficher.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {devis.map((d) => (
                      <li key={d.id} className="px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                              {d.objet}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {d.chantier?.nom}
                              {d.dateValidite
                                ? ` · valable jusqu'au ${formatDate(d.dateValidite)}`
                                : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <StatutBadge def={STATUT_DEVIS[d.statut]} />
                            <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                              {formatEuro(Number(d.montantTTC))}
                            </span>
                            {d.lienExterne && (
                              <a
                                href={d.lienExterne}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-brand-600"
                                aria-label="Voir le devis"
                              >
                                <ExternalLink size={14} />
                              </a>
                            )}
                          </div>
                        </div>
                        {(d.statut === "ENVOYE" ||
                          d.statut === "RELANCE" ||
                          d.signatureClientUrl) && (
                          <SignBoxClient
                            docId={d.id}
                            action={signerDevisClient}
                            signeUrl={d.signatureClientUrl}
                            signeLe={d.signatureClientLe}
                            signeNom={d.signatureClientNom}
                            libelle="Signer pour accepter"
                            mention="Votre signature vaut bon pour accord et acceptation de ce devis. Elle est horodatée et associée à votre compte."
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          )}

          {/* Situations */}
          {showSituations && (
            <Card>
              <CardHeader>
                <CardTitle>Situations d&apos;avancement</CardTitle>
              </CardHeader>
              <CardBody className="!p-0">
                {situations.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
                    Aucune situation à afficher.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {situations.map((s) => (
                      <li key={s.id} className="px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                              Situation n°{s.numeroOrdre} —{" "}
                              {Number(s.avancementCumulePct)}% d&apos;avancement
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {s.chantier?.nom} · établie le{" "}
                              {formatDate(s.dateEtablissement)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <StatutBadge def={STATUT_SITUATION[s.statut]} />
                            <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                              {formatEuro(Number(s.netAPayerPeriode))}
                            </span>
                          </div>
                        </div>
                        {(s.statut === "TRANSMISE" ||
                          s.statut === "VISEE_MOE" ||
                          s.signatureClientUrl) && (
                          <SignBoxClient
                            docId={s.id}
                            action={signerSituationClient}
                            signeUrl={s.signatureClientUrl}
                            signeLe={s.signatureClientLe}
                            signeNom={s.signatureClientNom}
                            libelle="Signer pour approuver l'avancement"
                            mention="Votre signature valide le pourcentage d'avancement à cette date et autorise la facture d'acompte, sans valoir réception ni acceptation définitive des ouvrages. Elle est horodatée et associée à votre compte."
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          )}

          {/* Factures */}
          {showFactures && (
            <Card>
              <CardHeader>
                <CardTitle>Factures</CardTitle>
              </CardHeader>
              <CardBody className="!p-0">
                {factures.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
                    Aucune facture à afficher.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {factures.map((f) => (
                      <li
                        key={f.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                            <span className="text-xs text-slate-400">
                              {TYPE_FACTURE[f.type]} ·{" "}
                            </span>
                            {f.objet || f.referenceExterne || "Facture"}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {f.chantier?.nom}
                            {f.dateEcheance
                              ? ` · échéance ${formatDate(f.dateEcheance)}`
                              : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatutBadge def={STATUT_EMISSION[f.statutEmission]} />
                          <StatutBadge def={STATUT_REGLEMENT[f.statutReglement]} />
                          <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                            {formatEuro(Number(f.montantTTC))}
                          </span>
                          {f.lienExterne && (
                            <a
                              href={f.lienExterne}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand-600"
                              aria-label="Voir la facture"
                            >
                              <ExternalLink size={14} />
                            </a>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
