import "server-only";
import { db } from "@/lib/db";
import { bornerJour } from "@/lib/suivi-commercial-calc";
import {
  classerFacture,
  classerDevis,
  classerSituation,
  classerRetenue,
  PREAVIS_LIBERATION_RETENUE_JOURS,
} from "@/lib/relances-calc";
import { genererTexteRelanceFacture } from "@/lib/relances-texte";
import type { ConstatRelanceUI, RelanceLogUI } from "./relances-types";
import { RANG_PALIER } from "./relances-types";

// ─── Relances : dérivation des constats OUVERTS pour l'affichage ─────────────
// Les cartes du cockpit dérivent les constats EN DIRECT avec les mêmes
// fonctions de classification que le moteur (lib/relances) : RelanceLog n'est
// que l'HISTORIQUE des notifications envoyées, jamais la source de vérité.
// « En retard » se dérive, il ne se stocke pas (doctrine du module).

const JOUR_MS = 24 * 3600 * 1000;

export interface PerimetreRelances {
  /** Espaces visibles (null = aucun bornage : héritage admin global). */
  espaceIds: string[] | null;
  /** Borne d'adhésion d'un conducteur (null = pas de borne). */
  chantierIds?: string[] | null;
  /** Borne à UN projet (page de détail). */
  chantierId?: string;
}

function filtrePerimetre(p: PerimetreRelances) {
  return {
    ...(p.espaceIds ? { espaceId: { in: p.espaceIds } } : {}),
    ...(p.chantierId
      ? { chantierId: p.chantierId }
      : p.chantierIds
        ? { chantierId: { in: p.chantierIds } }
        : {}),
  };
}

/**
 * Dérive tous les constats ouverts du périmètre : factures par palier, devis
 * sans réponse, situations validées non facturées, retenues libérables.
 * Résultat trié par gravité décroissante puis ancienneté, sérialisable tel
 * quel vers les composants client.
 */
export async function getConstatsRelances(
  perimetre: PerimetreRelances
): Promise<ConstatRelanceUI[]> {
  const filtre = filtrePerimetre(perimetre);
  const aujourdHui = bornerJour(new Date());
  // Mêmes bornes SQL grossières que le moteur : la classification fine
  // (bornée au jour) retranche ensuite.
  const horizonPreavisFactures = new Date(aujourdHui.getTime() + 7 * JOUR_MS);
  const horizonRetenues = new Date(
    aujourdHui.getTime() + (PREAVIS_LIBERATION_RETENUE_JOURS + 1) * JOUR_MS
  );

  const [factures, devis, situations, retenues] = await Promise.all([
    db.facture.findMany({
      where: {
        ...filtre,
        statutEmission: { in: ["EMISE", "ENVOYEE"] },
        statutReglement: { in: ["NON_PAYEE", "PARTIELLEMENT_PAYEE"] },
        type: { not: "AVOIR" },
        dateEcheance: { not: null, lte: horizonPreavisFactures },
      },
      select: {
        id: true,
        chantierId: true,
        statutEmission: true,
        statutReglement: true,
        referenceExterne: true,
        objet: true,
        montantTTC: true,
        montantPaye: true,
        dateEcheance: true,
        chantier: { select: { nom: true } },
        marche: { select: { reference: true, maitreOuvrageNom: true } },
        clientUser: { select: { name: true } },
      },
    }),
    db.devis.findMany({
      where: { ...filtre, statut: { in: ["ENVOYE", "RELANCE"] } },
      select: {
        id: true,
        chantierId: true,
        statut: true,
        referenceExterne: true,
        objet: true,
        montantTTC: true,
        dateEmission: true,
        dateEnvoi: true,
        prochaineRelance: true,
        chantier: { select: { nom: true } },
        clientUser: { select: { name: true } },
      },
    }),
    db.situationTravaux.findMany({
      where: { ...filtre, statut: { in: ["VISEE_MOE", "ACCEPTEE"] }, factureId: null },
      select: {
        id: true,
        chantierId: true,
        statut: true,
        factureId: true,
        numeroOrdre: true,
        netAPayerPeriode: true,
        dateVisaMOE: true,
        dateEtablissement: true,
        chantier: { select: { nom: true } },
        marche: { select: { reference: true } },
      },
    }),
    db.retenueGarantie.findMany({
      where: {
        ...filtre,
        statut: { in: ["RETENUE", "CONSIGNEE"] },
        dateEcheanceLiberation: { not: null, lte: horizonRetenues },
      },
      select: {
        id: true,
        chantierId: true,
        statut: true,
        dateEcheanceLiberation: true,
        montantRetenuCumul: true,
        chantier: { select: { nom: true } },
        marche: { select: { reference: true } },
      },
    }),
  ]);

  const constats: ConstatRelanceUI[] = [];

  for (const f of factures) {
    const c = classerFacture(f, aujourdHui);
    if (!c) continue;
    const ref = f.referenceExterne || f.objet || "sans référence";
    const resteDu = Math.max(0, Number(f.montantTTC) - Number(f.montantPaye));
    const qui = f.clientUser?.name || f.marche?.maitreOuvrageNom || null;
    const agePhrase =
      c.palier === "PREAVIS_ECHEANCE"
        ? c.jours === 0
          ? "échéance aujourd'hui"
          : `échéance dans ${c.jours} j`
        : `échue depuis ${c.jours} j`;
    const texteRelance =
      (c.palier === "RELANCE_2" ||
        c.palier === "RELANCE_3" ||
        c.palier === "MISE_EN_DEMEURE") &&
      f.dateEcheance
        ? genererTexteRelanceFacture({
            reference: ref,
            client: qui,
            montantTTC: Number(f.montantTTC),
            resteDu,
            dateEcheance: f.dateEcheance,
            joursRetard: c.jours,
            palier: c.palier,
          })
        : null;
    constats.push({
      cle: `FACTURE:${f.id}`,
      objetType: "FACTURE",
      objetId: f.id,
      palier: c.palier,
      jours: c.jours,
      libelle: `Facture ${ref}`,
      contexte:
        [qui ? `Client ${qui}` : null, f.marche ? `marché ${f.marche.reference}` : null]
          .filter(Boolean)
          .join(" · ") || null,
      agePhrase,
      montant: resteDu,
      chantierId: f.chantierId,
      chantierNom: f.chantier?.nom ?? null,
      texteRelance,
    });
  }

  for (const d of devis) {
    const c = classerDevis(d, aujourdHui);
    if (!c) continue;
    const ref = d.referenceExterne || d.objet || "sans référence";
    constats.push({
      cle: `DEVIS:${d.id}`,
      objetType: "DEVIS",
      objetId: d.id,
      palier: c.palier,
      jours: c.jours,
      libelle: `Devis ${ref}`,
      contexte: d.clientUser?.name ? `Client ${d.clientUser.name}` : null,
      agePhrase: `sans réponse depuis ${c.jours} j`,
      montant: Number(d.montantTTC),
      chantierId: d.chantierId,
      chantierNom: d.chantier?.nom ?? null,
      texteRelance: null,
    });
  }

  for (const s of situations) {
    const c = classerSituation(s, aujourdHui);
    if (!c) continue;
    const etat = s.statut === "VISEE_MOE" ? "visée MOE" : "acceptée";
    constats.push({
      cle: `SITUATION:${s.id}`,
      objetType: "SITUATION",
      objetId: s.id,
      palier: c.palier,
      jours: c.jours,
      libelle: `Situation n°${s.numeroOrdre}`,
      contexte: `Marché ${s.marche.reference}`,
      agePhrase: `${etat} depuis ${c.jours} j`,
      montant: Number(s.netAPayerPeriode),
      chantierId: s.chantierId,
      chantierNom: s.chantier?.nom ?? null,
      texteRelance: null,
    });
  }

  for (const r of retenues) {
    const c = classerRetenue(r, aujourdHui);
    if (!c) continue;
    const agePhrase =
      c.jours > 0
        ? `libérable dans ${c.jours} j`
        : c.jours === 0
          ? "libérable aujourd'hui"
          : `libérable depuis ${-c.jours} j`;
    constats.push({
      cle: `RETENUE:${r.id}`,
      objetType: "RETENUE",
      objetId: r.id,
      palier: c.palier,
      jours: c.jours,
      libelle: "Retenue de garantie",
      contexte: `Marché ${r.marche.reference}`,
      agePhrase,
      montant: Number(r.montantRetenuCumul),
      chantierId: r.chantierId,
      chantierNom: r.chantier?.nom ?? null,
      texteRelance: null,
    });
  }

  // Gravité décroissante, puis le plus ancien d'abord (pour la retenue,
  // `jours` décroît vers l'échéance : l'ordre croissant met l'échue en tête).
  constats.sort((a, b) => {
    const rang = RANG_PALIER[a.palier] - RANG_PALIER[b.palier];
    if (rang !== 0) return rang;
    return a.objetType === "RETENUE" ? a.jours - b.jours : b.jours - a.jours;
  });
  return constats;
}

/**
 * Les 5 dernières notifications journalisées du périmètre (historique).
 * `chantierIds` : borne d'adhésion d'un conducteur, mêmes règles que les
 * constats (deny par défaut : tableau vide = rien ; les lignes sans chantier,
 * chantierId null, sont exclues pour un non-admin).
 */
export async function getDerniersRelanceLogs(
  espaceIds: string[] | null,
  chantierIds?: string[] | null
): Promise<RelanceLogUI[]> {
  const logs = await db.relanceLog.findMany({
    where: {
      ...(espaceIds ? { espaceId: { in: espaceIds } } : {}),
      ...(chantierIds ? { chantierId: { in: chantierIds } } : {}),
    },
    orderBy: { envoyeLe: "desc" },
    take: 5,
    select: { id: true, resume: true, envoyeLe: true },
  });
  return logs.map((l) => ({
    id: l.id,
    resume: l.resume,
    envoyeLe: l.envoyeLe.toISOString(),
  }));
}
