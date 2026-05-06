import "server-only";
import { db } from "@/lib/db";

export interface FinanceChantier {
  budgetEspeces: number;
  budgetVirement: number;
  budgetTotal: number;

  coutMainOeuvre: number; // estimation depuis pointages
  coutCommandes: number; // commandes non annulées
  coutLocations: number; // locations clôturées + en cours
  coutTotal: number;

  marge: number; // budget - coût
  margePct: number; // (budget - coût) / budget * 100

  jourshomme: number;
  commandesCount: number;
  locationsCount: number;
}

const JOURS_PAR_MOIS = 23;
const JOURS_PAR_SEMAINE = 6;

function tauxJournalier(typeContrat: string, tarifBase: number): number {
  switch (typeContrat) {
    case "FIXE":
    case "MOIS":
      return tarifBase / JOURS_PAR_MOIS;
    case "JOUR":
      return tarifBase;
    case "SEMAINE":
      return tarifBase / JOURS_PAR_SEMAINE;
    case "FORFAIT":
      // Le forfait n'est pas amorti par jour ; on l'ignore dans l'estimation journalière.
      return 0;
    default:
      return 0;
  }
}

export async function getFinanceChantier(chantierId: string): Promise<FinanceChantier> {
  const [chantier, pointages, commandes, locations] = await Promise.all([
    db.chantier.findUnique({
      where: { id: chantierId },
      select: { budgetEspeces: true, budgetVirement: true },
    }),
    db.pointage.findMany({
      where: { chantierId },
      include: {
        ouvrier: { select: { typeContrat: true, tarifBase: true } },
      },
    }),
    db.commande.findMany({
      where: { chantierId, statut: { not: "ANNULEE" } },
      select: { coutTotal: true },
    }),
    db.locationPret.findMany({
      where: { chantierId, type: "LOCATION" },
      select: { coutTotal: true },
    }),
  ]);

  if (!chantier) {
    return {
      budgetEspeces: 0,
      budgetVirement: 0,
      budgetTotal: 0,
      coutMainOeuvre: 0,
      coutCommandes: 0,
      coutLocations: 0,
      coutTotal: 0,
      marge: 0,
      margePct: 0,
      jourshomme: 0,
      commandesCount: 0,
      locationsCount: 0,
    };
  }

  const budgetEspeces = Number(chantier.budgetEspeces);
  const budgetVirement = Number(chantier.budgetVirement);
  const budgetTotal = budgetEspeces + budgetVirement;

  let coutMainOeuvre = 0;
  let jourshomme = 0;
  for (const p of pointages) {
    const j = Number(p.joursTravailles);
    jourshomme += j;
    coutMainOeuvre += j * tauxJournalier(p.ouvrier.typeContrat, Number(p.ouvrier.tarifBase));
  }
  coutMainOeuvre = Math.round(coutMainOeuvre * 100) / 100;

  const coutCommandes = commandes.reduce((s, c) => s + Number(c.coutTotal), 0);
  const coutLocations = locations.reduce((s, l) => s + Number(l.coutTotal), 0);

  const coutTotal = Math.round((coutMainOeuvre + coutCommandes + coutLocations) * 100) / 100;
  const marge = Math.round((budgetTotal - coutTotal) * 100) / 100;
  const margePct = budgetTotal > 0 ? Math.round((marge / budgetTotal) * 1000) / 10 : 0;

  return {
    budgetEspeces,
    budgetVirement,
    budgetTotal,
    coutMainOeuvre,
    coutCommandes,
    coutLocations,
    coutTotal,
    marge,
    margePct,
    jourshomme,
    commandesCount: commandes.length,
    locationsCount: locations.length,
  };
}
