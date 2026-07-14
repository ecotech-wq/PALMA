import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-helpers";
import { fmtValeur } from "../../../labo-labels";
import { RapportPrintView } from "./RapportPrintView";

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

const dateShortFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/**
 * Rapport d'essai imprimable, structuré selon la logique ISO/IEC 17025 § 7.8
 * (sans viser l'accréditation) : identification de l'objet, méthodes (norme
 * ou protocole), conditions de cure, résultats avec unités et incertitudes,
 * verdicts de conformité, opérateur, date, signatures. Même motif que le PV
 * de réception imprimable (PvPrintView) avec l'entête d'entreprise.
 */
export default async function RapportEssaiPrintPage({
  params,
}: {
  params: Promise<{ prelevementId: string }>;
}) {
  const { prelevementId } = await params;
  const me = await requireAuth();

  const p = await db.prelevementLabo.findUnique({
    where: { id: prelevementId },
    include: {
      espace: {
        select: {
          nom: true,
          couleur: true,
          logoUrl: true,
          adresse: true,
          telephone: true,
          email: true,
          siret: true,
        },
      },
      chantier: { select: { nom: true, adresse: true } },
      formulation: {
        select: { nom: true, campagne: true, composition: true },
      },
      eprouvettes: { orderBy: { code: "asc" } },
      essais: {
        include: {
          eprouvette: { select: { code: true } },
          equipement: { select: { nom: true, dateEtalonnage: true } },
        },
        orderBy: [{ echeance: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  if (!p) notFound();
  // Frontière d'espace, même convention que les actions (null = hérité).
  if (me.espaceIds && !me.espaceIds.includes(p.espaceId)) notFound();

  // Décimaux et dates sérialisés côté serveur : le composant client ne
  // reçoit que des chaînes prêtes à imprimer.
  const essais = p.essais
    .filter((e) => e.statut !== "ANNULE")
    .map((e) => ({
      id: e.id,
      type: e.type,
      methode: e.norme ?? (e.protocole ? "Protocole interne" : "-"),
      protocole: e.protocole,
      eprouvette: e.eprouvette?.code ?? null,
      equipement: e.equipement
        ? `${e.equipement.nom}${
            e.equipement.dateEtalonnage
              ? ` (étalonné le ${dateShortFmt.format(
                  new Date(e.equipement.dateEtalonnage)
                )})`
              : ""
          }`
        : null,
      statut: e.statut,
      dateRealisation: e.dateRealisation
        ? dateShortFmt.format(new Date(e.dateRealisation))
        : null,
      echeance: e.echeance
        ? dateShortFmt.format(new Date(e.echeance))
        : null,
      operateur: e.operateur,
      resultat:
        e.valeur !== null
          ? `${fmtValeur(Number(e.valeur))}${e.unite ? ` ${e.unite}` : ""}${
              e.incertitude ? ` ± ${e.incertitude}` : ""
            }`
          : null,
      seuil:
        e.seuil !== null
          ? `${fmtValeur(Number(e.seuil))}${e.unite ? ` ${e.unite}` : ""}`
          : null,
      conforme: e.conforme,
      note: e.note,
    }));

  const nbAnnules = p.essais.length - essais.length;
  const operateurs = [
    ...new Set(essais.map((e) => e.operateur).filter((o): o is string => !!o)),
  ];

  return (
    <RapportPrintView
      espace={p.espace}
      rapport={{
        numero: `RE-${p.reference}`,
        dateEdition: dateFmt.format(new Date()),
      }}
      prelevement={{
        reference: p.reference,
        materiau: p.materiau,
        origine: p.origine,
        datePrelevement: dateFmt.format(new Date(p.datePrelevement)),
        preleveur: p.preleveur,
        classePrescrite: p.classePrescrite,
        note: p.note,
        contexte: p.chantier
          ? `Chantier : ${p.chantier.nom}${
              p.chantier.adresse ? `, ${p.chantier.adresse}` : ""
            }`
          : p.formulation
            ? `Formulation R&D : ${p.formulation.nom}${
                p.formulation.campagne
                  ? ` (campagne ${p.formulation.campagne})`
                  : ""
              }`
            : "Essai interne",
        composition: p.formulation?.composition ?? null,
      }}
      eprouvettes={p.eprouvettes.map((ep) => ({
        code: ep.code,
        geometrie: ep.geometrie,
        dateFabrication: ep.dateFabrication
          ? dateShortFmt.format(new Date(ep.dateFabrication))
          : null,
        conditionsCure: ep.conditionsCure,
      }))}
      essais={essais}
      nbAnnules={nbAnnules}
      operateurs={operateurs}
    />
  );
}
