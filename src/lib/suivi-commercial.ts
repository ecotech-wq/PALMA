import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { euros, bornerJour, trancheDe } from "@/lib/suivi-commercial-calc";

// ─── Suivi financier : agrégations serveur (KPI dérivés depuis la base) ───────
// Le CALCUL métier pur vit dans suivi-commercial-calc.ts (testé). Ici, on lit
// la base et on dérive les indicateurs de pilotage. Rien de dérivé n'est saisi.
// Réexport des calculs purs pour les appelants qui n'ont besoin que d'eux.
export {
  calculerSituation,
  calculerEcheance,
  type EntreeSituation,
  type CalculSituation,
} from "@/lib/suivi-commercial-calc";

function toNum(d: Prisma.Decimal | number | null | undefined): number {
  return d == null ? 0 : Number(d);
}

// ── Synthèse financière d'un chantier (KPI dérivés) ─────────────────────────

export interface SuiviChantier {
  aUnMarche: boolean;
  montantMarcheHT: number;
  cumulFactureHT: number;
  cumulFactureTTC: number;
  cumulEncaisse: number;
  resteAFacturerHT: number;
  resteAEncaisser: number;
  tauxAvancementFinancier: number; // cumul facturé / marché (%)
  retenueEnCours: number;
  retenueDateLiberation: Date | null;
  facturesEnRetard: number;
  montantEnRetard: number;
  devisEnAttente: number; // envoyés/relancés non tranchés
}

/**
 * Agrège le suivi d'un chantier. Ne lit QUE des données suivies ; aucun budget
 * estimé. Le « en retard » est dérivé (non payé et échéance passée), jamais
 * stocké. `maintenant` est injectable pour les tests.
 */
export async function getSuiviChantier(
  chantierId: string,
  maintenant: Date = new Date()
): Promise<SuiviChantier> {
  const [marche, facturesAgg, facturesEnRetard, retenue, devisAgg] =
    await Promise.all([
      db.marche.findFirst({
        where: { chantierId },
        orderBy: { createdAt: "asc" },
        select: { montantCourantHT: true },
      }),
      db.facture.findMany({
        where: {
          chantierId,
          statutEmission: { not: "ANNULEE" },
          type: { not: "AVOIR" },
        },
        select: { montantHT: true, montantTTC: true, montantPaye: true },
      }),
      db.facture.findMany({
        where: {
          chantierId,
          statutReglement: { in: ["NON_PAYEE", "PARTIELLEMENT_PAYEE"] },
          statutEmission: { not: "ANNULEE" },
          dateEcheance: { lt: bornerJour(maintenant) },
        },
        select: { montantTTC: true, montantPaye: true },
      }),
      db.retenueGarantie.findFirst({
        where: { chantierId, statut: { in: ["RETENUE", "CONSIGNEE"] } },
        select: { montantRetenuCumul: true, dateEcheanceLiberation: true },
      }),
      db.devis.count({
        where: { chantierId, statut: { in: ["ENVOYE", "RELANCE"] } },
      }),
    ]);

  const montantMarcheHT = toNum(marche?.montantCourantHT);
  const cumulFactureHT = euros(
    facturesAgg.reduce((s, f) => s + toNum(f.montantHT), 0)
  );
  const cumulFactureTTC = euros(
    facturesAgg.reduce((s, f) => s + toNum(f.montantTTC), 0)
  );
  const cumulEncaisse = euros(
    facturesAgg.reduce((s, f) => s + toNum(f.montantPaye), 0)
  );
  const montantEnRetard = euros(
    facturesEnRetard.reduce(
      (s, f) => s + Math.max(0, toNum(f.montantTTC) - toNum(f.montantPaye)),
      0
    )
  );

  return {
    aUnMarche: !!marche,
    montantMarcheHT,
    cumulFactureHT,
    cumulFactureTTC,
    cumulEncaisse,
    resteAFacturerHT: euros(montantMarcheHT - cumulFactureHT),
    resteAEncaisser: euros(cumulFactureTTC - cumulEncaisse),
    tauxAvancementFinancier:
      montantMarcheHT > 0
        ? Math.round((cumulFactureHT / montantMarcheHT) * 1000) / 10
        : 0,
    retenueEnCours: toNum(retenue?.montantRetenuCumul),
    retenueDateLiberation: retenue?.dateEcheanceLiberation ?? null,
    facturesEnRetard: facturesEnRetard.length,
    montantEnRetard,
    devisEnAttente: devisAgg,
  };
}

// ── Synthèse d'espace (cockpit trésorerie) ──────────────────────────────────

export interface TrancheAge {
  cle: string; // "non_echu" | "0_30" | "31_60" | "61_90" | "plus_90"
  libelle: string;
  montant: number;
}

export interface CockpitEspace {
  resteAEncaisser: number;
  montantEnRetard: number;
  encaisseCeMois: number;
  retenuesALiberer: number;
  dso: number | null;
  balanceAgee: TrancheAge[];
  devisEnAttente: number;
  facturesOuvertes: number;
}

/**
 * Cockpit d'un espace (ou de plusieurs, en mode « tous »). `espaceIds` provient
 * de user.espaceIds : null = régime hérité (pas de bornage), [] = deny (aucun
 * espace, tout à zéro). `chantierIds` borne EN PLUS par l'adhésion : null pour
 * un admin (tout l'espace), la liste des chantiers accessibles pour un
 * conducteur (il ne voit pas les projets dont il n'est pas membre).
 * Toutes les valeurs sont dérivées.
 */
export async function getCockpitEspace(
  espaceIds: string[] | null,
  chantierIds: string[] | null = null,
  maintenant: Date = new Date()
): Promise<CockpitEspace> {
  const zero: CockpitEspace = {
    resteAEncaisser: 0,
    montantEnRetard: 0,
    encaisseCeMois: 0,
    retenuesALiberer: 0,
    dso: null,
    balanceAgee: tranchesVides(),
    devisEnAttente: 0,
    facturesOuvertes: 0,
  };
  if (espaceIds && espaceIds.length === 0) return zero;
  if (chantierIds && chantierIds.length === 0) return zero;

  const filtreEspace = {
    ...(espaceIds ? { espaceId: { in: espaceIds } } : {}),
    ...(chantierIds ? { chantierId: { in: chantierIds } } : {}),
  };
  const aujourdHui = bornerJour(maintenant);
  const debutMois = new Date(
    Date.UTC(aujourdHui.getUTCFullYear(), aujourdHui.getUTCMonth(), 1)
  );
  // Fenêtre 12 mois pour le DSO (créances / CA sur la période x jours).
  const ilYaUnAn = new Date(aujourdHui);
  ilYaUnAn.setUTCFullYear(ilYaUnAn.getUTCFullYear() - 1);

  const [ouvertes, encaissementsMois, retenues, facturesAn, devisEnAttente] =
    await Promise.all([
      db.facture.findMany({
        where: {
          ...filtreEspace,
          statutEmission: { not: "ANNULEE" },
          statutReglement: { in: ["NON_PAYEE", "PARTIELLEMENT_PAYEE"] },
          type: { not: "AVOIR" },
        },
        select: { montantTTC: true, montantPaye: true, dateEcheance: true },
      }),
      db.encaissement.findMany({
        where: {
          ...filtreEspace,
          dateEncaissement: { gte: debutMois, lte: aujourdHui },
        },
        select: { montant: true },
      }),
      db.retenueGarantie.findMany({
        where: {
          ...filtreEspace,
          statut: { in: ["RETENUE", "CONSIGNEE"] },
        },
        select: { montantRetenuCumul: true },
      }),
      db.facture.findMany({
        where: {
          ...filtreEspace,
          statutEmission: { not: "ANNULEE" },
          type: { not: "AVOIR" },
          dateEmission: { gte: ilYaUnAn },
        },
        select: { montantTTC: true, montantPaye: true },
      }),
      db.devis.count({
        where: { ...filtreEspace, statut: { in: ["ENVOYE", "RELANCE"] } },
      }),
    ]);

  const resteAEncaisser = euros(
    ouvertes.reduce(
      (s, f) => s + Math.max(0, toNum(f.montantTTC) - toNum(f.montantPaye)),
      0
    )
  );
  const balance = tranchesVides();
  let enRetard = 0;
  for (const f of ouvertes) {
    const du = Math.max(0, toNum(f.montantTTC) - toNum(f.montantPaye));
    if (du <= 0) continue;
    const cle = trancheDe(f.dateEcheance, aujourdHui);
    const t = balance.find((b) => b.cle === cle)!;
    t.montant = euros(t.montant + du);
    if (cle !== "non_echu") enRetard = euros(enRetard + du);
  }

  const encaisseCeMois = euros(
    encaissementsMois.reduce((s, e) => s + toNum(e.montant), 0)
  );
  const retenuesALiberer = euros(
    retenues.reduce((s, r) => s + toNum(r.montantRetenuCumul), 0)
  );

  // DSO = (créances TTC ouvertes / CA TTC des 12 mois) x 365. Null si pas de CA.
  const caAn = euros(facturesAn.reduce((s, f) => s + toNum(f.montantTTC), 0));
  const dso = caAn > 0 ? Math.round((resteAEncaisser / caAn) * 365) : null;

  return {
    resteAEncaisser,
    montantEnRetard: enRetard,
    encaisseCeMois,
    retenuesALiberer,
    dso,
    balanceAgee: balance,
    devisEnAttente,
    facturesOuvertes: ouvertes.length,
  };
}

function tranchesVides(): TrancheAge[] {
  return [
    { cle: "non_echu", libelle: "Non échu", montant: 0 },
    { cle: "0_30", libelle: "0 à 30 j", montant: 0 },
    { cle: "31_60", libelle: "31 à 60 j", montant: 0 },
    { cle: "61_90", libelle: "61 à 90 j", montant: 0 },
    { cle: "plus_90", libelle: "+ de 90 j", montant: 0 },
  ];
}
