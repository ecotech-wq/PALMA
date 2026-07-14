/**
 * Données d'exemple « EX » : 3 projets complets et réalistes (La Réunion)
 * pour tester toute l'application avec des données parlantes.
 *
 *   1. EX Villa Hauts de Saint-Paul   (gros œuvre, EN_COURS, Autonhome)
 *   2. EX Résidence Les Filaos        (second œuvre, EN_COURS, Autonhome)
 *   3. EX Extension École de Bras-Panon (études, PLANIFIE, EcoTech)
 *      + 2 formulations R&D terre-chanvre (labo comparatif)
 *
 * Usage : npx tsx scripts/seed-projets-exemples.ts
 *
 * - GARDE-FOU : refuse de tourner si l'hôte de DATABASE_URL n'est pas
 *   localhost / 127.0.0.1 (jamais sur une base de production).
 * - N'efface RIEN : s'ajoute à côté du seed standard et des chantiers [DEMO].
 * - Skip si des chantiers « EX » existent déjà (pas de doublons).
 * - Toutes les dates sont RELATIVES à aujourd'hui : les paliers de relance
 *   (R2, mise en demeure, devis sans réponse, essai échu...) restent vrais
 *   quel que soit le jour où le script est rejoué.
 *
 * Pour rejouer après suppression :
 *   DELETE FROM "Chantier" WHERE nom LIKE 'EX %';
 *   DELETE FROM "FormulationLabo" WHERE nom LIKE 'EX %';
 *   DELETE FROM "Ouvrier" WHERE nom LIKE 'EX-%' OR notes LIKE '%[EX]%';
 *   (les équipes, marchés, factures... suivent par cascade ou restent inertes)
 */

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import { calculerSituation } from "../src/lib/suivi-commercial-calc";

config(); // Charge .env

// ---------- Garde-fou : base LOCALE uniquement ----------

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set in .env");
}
{
  let host = "";
  try {
    host = new URL(connectionString).hostname;
  } catch {
    console.error("DATABASE_URL illisible : abandon par prudence.");
    process.exit(1);
  }
  const locaux = ["localhost", "127.0.0.1", "::1", "[::1]"];
  if (!locaux.includes(host)) {
    console.error(
      `GARDE-FOU : l'hôte de DATABASE_URL est « ${host} », pas localhost.\n` +
        "Ce script de données d'exemple ne tourne JAMAIS ailleurs qu'en local. Abandon."
    );
    process.exit(1);
  }
}

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

// ---------- Helpers dates (bornées à minuit UTC, convention du dépôt) ----------

/** Minuit UTC du jour J + offset (offset négatif = passé). */
function jour(offset: number): Date {
  const d = new Date();
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + offset)
  );
}

// ---------- Seed ----------

async function seed() {
  console.log("Seed projets d'exemple (EX) : démarrage...");

  // Idempotence : ne pas dupliquer si déjà passé.
  const dejaLa = await db.chantier.count({
    where: { nom: { startsWith: "EX " } },
  });
  if (dejaLa > 0) {
    console.log(
      `${dejaLa} chantiers « EX » existent déjà : skip.\n` +
        `Pour rejouer, supprimer d'abord : DELETE FROM "Chantier" WHERE nom LIKE 'EX %';`
    );
    return;
  }

  const admin = await db.user.findFirst({
    where: { role: "ADMIN", status: "ACTIVE" },
  });
  if (!admin) {
    throw new Error("Aucun admin ACTIF trouvé : lancer d'abord prisma/seed.ts");
  }

  // Espaces : travaux -> Autonhome, bureau d'études -> EcoTech,
  // sinon repli sur le premier espace existant.
  const espaces = await db.espace.findMany({ orderBy: { createdAt: "asc" } });
  if (espaces.length === 0) {
    throw new Error("Aucun espace en base : lancer d'abord les migrations/seed.");
  }
  const espTravaux =
    espaces.find((e) => e.slug === "autonhome") ?? espaces[0];
  const espBE = espaces.find((e) => e.slug === "ecotech") ?? espTravaux;
  console.log(
    `Espaces : travaux -> ${espTravaux.nom}, études -> ${espBE.nom}`
  );

  const compteurs: Record<string, number> = {};
  const inc = (k: string, n = 1) => (compteurs[k] = (compteurs[k] ?? 0) + n);

  // ===========================================================================
  // PROJET 1 : EX Villa Hauts de Saint-Paul (gros œuvre, EN_COURS)
  // Démarré il y a 6 semaines (J-42), fin dans 8 semaines (J+56).
  // ===========================================================================

  const villa = await db.chantier.create({
    data: {
      nom: "EX Villa Hauts de Saint-Paul",
      adresse: "27 chemin Bellemène-les-Hauts, 97460 Saint-Paul, La Réunion",
      description:
        "Construction neuve d'une villa R+1 de 165 m² sur terrain en pente " +
        "dans les hauts de Saint-Paul. Lot gros œuvre complet : terrassement, " +
        "fondations superficielles (semelles filantes et plots), soubassement, " +
        "dallage porté, élévations en agglos avec poteaux-poutres en béton " +
        "armé C25/30 et C30/37, plancher poutrelles-hourdis, charpente bois " +
        "et couverture tôle prévue en fin de lot. Contrôle béton par " +
        "prélèvements et écrasements J+7 / J+28.",
      statut: "EN_COURS",
      type: "CHANTIER",
      espaceId: espTravaux.id,
      budgetEspeces: 6000,
      budgetVirement: 180000,
      dateDebut: jour(-42),
      dateFin: jour(56),
      chefId: admin.id,
    },
  });
  inc("chantiers");
  console.log(`  Chantier ${villa.nom}`);

  // ---- Équipes (2) et ouvriers (6, noms réunionnais, téléphones fictifs) ----

  const eqGO = await db.equipe.create({
    data: {
      nom: "EX Gros œuvre - Villa Saint-Paul",
      chantierId: villa.id,
      espaceId: espTravaux.id,
    },
  });
  const eqCharp = await db.equipe.create({
    data: {
      nom: "EX Charpente-couverture - Villa Saint-Paul",
      chantierId: villa.id,
      espaceId: espTravaux.id,
    },
  });
  inc("equipes", 2);

  const mkOuvrier = (d: {
    nom: string;
    prenom: string;
    telephone: string;
    typeContrat: "FIXE" | "JOUR" | "SEMAINE" | "MOIS" | "FORFAIT";
    tarifBase: number;
    modePaie: "JOUR" | "SEMAINE" | "MOIS";
    equipeId: string;
    espaceId: string;
    notes: string;
  }) =>
    db.ouvrier.create({
      data: { ...d, actif: true },
    });

  const [ouvPayet, ouvHoarau, ouvGrondin, ouvTecher, ouvFontaine, ouvMaillot] =
    await Promise.all([
      mkOuvrier({
        nom: "Payet",
        prenom: "Jean-Yves",
        telephone: "0692 55 01 21",
        typeContrat: "MOIS",
        tarifBase: 2650,
        modePaie: "MOIS",
        equipeId: eqGO.id,
        espaceId: espTravaux.id,
        notes: "[EX] Chef d'équipe gros œuvre, 18 ans d'expérience, CACES R482.",
      }),
      mkOuvrier({
        nom: "Hoarau",
        prenom: "Sully",
        telephone: "0692 55 01 34",
        typeContrat: "JOUR",
        tarifBase: 98,
        modePaie: "SEMAINE",
        equipeId: eqGO.id,
        espaceId: espTravaux.id,
        notes: "[EX] Maçon coffreur, spécialiste banches et poteaux.",
      }),
      mkOuvrier({
        nom: "Grondin",
        prenom: "Mickaël",
        telephone: "0692 55 01 47",
        typeContrat: "JOUR",
        tarifBase: 92,
        modePaie: "SEMAINE",
        equipeId: eqGO.id,
        espaceId: espTravaux.id,
        notes: "[EX] Maçon, ferraillage et reprises d'enduit.",
      }),
      mkOuvrier({
        nom: "Técher",
        prenom: "Dominique",
        telephone: "0693 55 01 52",
        typeContrat: "SEMAINE",
        tarifBase: 560,
        modePaie: "SEMAINE",
        equipeId: eqGO.id,
        espaceId: espTravaux.id,
        notes: "[EX] Manœuvre polyvalent, conduite mini-pelle.",
      }),
      mkOuvrier({
        nom: "Fontaine",
        prenom: "Jean-Bernard",
        telephone: "0692 55 01 68",
        typeContrat: "MOIS",
        tarifBase: 2400,
        modePaie: "MOIS",
        equipeId: eqCharp.id,
        espaceId: espTravaux.id,
        notes: "[EX] Charpentier bois, habilitation travail en hauteur.",
      }),
      mkOuvrier({
        nom: "Maillot",
        prenom: "Ludovic",
        telephone: "0693 55 01 73",
        typeContrat: "FORFAIT",
        tarifBase: 1800,
        modePaie: "MOIS",
        equipeId: eqCharp.id,
        espaceId: espTravaux.id,
        notes: "[EX] Couvreur, forfait pose couverture tôle et étanchéité.",
      }),
    ]);
  inc("ouvriers", 6);

  // ---- Sections et labels ----

  const [secTerr, secGO, secCharp] = await Promise.all([
    db.section.create({
      data: { chantierId: villa.id, nom: "Terrassement", couleur: "#a16207", ordre: 0 },
    }),
    db.section.create({
      data: { chantierId: villa.id, nom: "Gros œuvre", couleur: "#475569", ordre: 1 },
    }),
    db.section.create({
      data: { chantierId: villa.id, nom: "Charpente", couleur: "#b45309", ordre: 2 },
    }),
  ]);
  inc("sections", 3);

  const [labBeton, labSecu, labLivraison] = await Promise.all([
    db.label.create({
      data: { nom: "EX Béton", couleur: "#64748b", chantierId: villa.id },
    }),
    db.label.create({
      data: { nom: "EX Sécurité", couleur: "#dc2626", chantierId: villa.id },
    }),
    db.label.create({
      data: { nom: "EX Livraison", couleur: "#2563eb", chantierId: villa.id },
    }),
  ]);
  inc("labels", 3);

  // ---- Planning : 15 tâches, chaîne + diamant (T5 -> {T6, T7} -> T8) ----
  // 2 tâches EN RETARD (T12, T13 : échues, non terminées), plusieurs à venir.

  type TacheDef = {
    key: string;
    nom: string;
    description?: string;
    section: string;
    equipeId: string;
    debut: number;
    fin: number;
    avancement: number;
    statut: "A_FAIRE" | "EN_COURS" | "TERMINEE" | "BLOQUEE";
    priorite: number;
    deps: string[];
    labels?: string[];
    ouvriers?: string[];
    ordre: number;
  };

  const tachesVilla: TacheDef[] = [
    {
      key: "T1",
      nom: "Installation de chantier et implantation",
      description:
        "Clôture, base vie, amenée du matériel, implantation de l'ouvrage par géomètre.",
      section: secTerr.id,
      equipeId: eqGO.id,
      debut: -42,
      fin: -38,
      avancement: 100,
      statut: "TERMINEE",
      priorite: 2,
      deps: [],
      labels: [labSecu.id],
      ouvriers: [ouvPayet.id],
      ordre: 0,
    },
    {
      key: "T2",
      nom: "Terrassement général et fouilles",
      description:
        "Décapage, plateforme, fouilles en rigoles et en puits selon plan de fondations.",
      section: secTerr.id,
      equipeId: eqGO.id,
      debut: -38,
      fin: -31,
      avancement: 100,
      statut: "TERMINEE",
      priorite: 2,
      deps: ["T1"],
      ouvriers: [ouvTecher.id],
      ordre: 1,
    },
    {
      key: "T3",
      nom: "Réseaux enterrés et mise à la terre",
      description: "Fourreaux EP/EU, adduction, ceinture de terre en fond de fouille.",
      section: secTerr.id,
      equipeId: eqGO.id,
      debut: -32,
      fin: -27,
      avancement: 100,
      statut: "TERMINEE",
      priorite: 3,
      deps: ["T2"],
      ordre: 2,
    },
    {
      key: "T12",
      nom: "Évacuation des terres excédentaires",
      description:
        "Rotation camions vers dépôt agréé : ralenti par la disponibilité des 8x4.",
      section: secTerr.id,
      equipeId: eqGO.id,
      debut: -20,
      fin: -8,
      avancement: 60,
      statut: "EN_COURS", // EN RETARD : échue depuis 8 jours, non terminée
      priorite: 3,
      deps: ["T2"],
      ouvriers: [ouvTecher.id],
      ordre: 3,
    },
    {
      key: "T4",
      nom: "Semelles filantes et plots (fondations)",
      description:
        "Béton de propreté, ferraillage, coulage C25/30. Prélèvement EX-BET-001 à la mise en œuvre.",
      section: secGO.id,
      equipeId: eqGO.id,
      debut: -27,
      fin: -19,
      avancement: 100,
      statut: "TERMINEE",
      priorite: 1,
      deps: ["T3"],
      labels: [labBeton.id],
      ouvriers: [ouvHoarau.id, ouvGrondin.id],
      ordre: 0,
    },
    {
      key: "T5",
      nom: "Soubassement et longrines",
      description: "Murs de soubassement en agglos à bancher, longrines C30/37 côté talus.",
      section: secGO.id,
      equipeId: eqGO.id,
      debut: -19,
      fin: -12,
      avancement: 100,
      statut: "TERMINEE",
      priorite: 2,
      deps: ["T4"],
      labels: [labBeton.id],
      ordre: 1,
    },
    {
      key: "T13",
      nom: "Drainage périphérique et enduit bitumineux",
      description:
        "Delta MS, drain agricole et enduit sur soubassement avant remblaiement.",
      section: secGO.id,
      equipeId: eqGO.id,
      debut: -12,
      fin: -6,
      avancement: 45,
      statut: "EN_COURS", // EN RETARD : échue depuis 6 jours, non terminée
      priorite: 2,
      deps: ["T5"],
      ouvriers: [ouvGrondin.id],
      ordre: 2,
    },
    {
      key: "T6",
      nom: "Dallage rez-de-chaussée (dalle portée)",
      description: "Hérisson, isolant, treillis ST25C, coulage et cure.",
      section: secGO.id,
      equipeId: eqGO.id,
      debut: -12,
      fin: -5,
      avancement: 100,
      statut: "TERMINEE",
      priorite: 2,
      deps: ["T5"],
      labels: [labBeton.id],
      ordre: 3,
    },
    {
      key: "T7",
      nom: "Élévation des murs du RDC (agglos)",
      description: "Montée des murs en blocs 20, harpages et réservations menuiseries.",
      section: secGO.id,
      equipeId: eqGO.id,
      debut: -11,
      fin: 2,
      avancement: 70,
      statut: "EN_COURS",
      priorite: 2,
      deps: ["T5"],
      ouvriers: [ouvHoarau.id, ouvGrondin.id],
      ordre: 4,
    },
    {
      key: "T8",
      nom: "Poteaux et poutres béton armé du RDC",
      description:
        "Coffrage, ferraillage et coulage C30/37 (prélèvement EX-BET-002). Diamant PERT : attend le dallage ET les élévations.",
      section: secGO.id,
      equipeId: eqGO.id,
      debut: -2,
      fin: 6,
      avancement: 30,
      statut: "EN_COURS",
      priorite: 1,
      deps: ["T6", "T7"], // fermeture du diamant
      labels: [labBeton.id, labSecu.id],
      ouvriers: [ouvPayet.id, ouvHoarau.id, ouvGrondin.id, ouvTecher.id],
      ordre: 5,
    },
    {
      key: "T9",
      nom: "Plancher haut RDC (poutrelles-hourdis)",
      description:
        "Pose des poutrelles et entrevous livrés par EX-CMD-0451, table de compression.",
      section: secGO.id,
      equipeId: eqGO.id,
      debut: 6,
      fin: 14,
      avancement: 0,
      statut: "A_FAIRE", // à venir
      priorite: 2,
      deps: ["T8"],
      labels: [labLivraison.id],
      ouvriers: [ouvPayet.id, ouvTecher.id],
      ordre: 6,
    },
    {
      key: "T10",
      nom: "Élévation des murs de l'étage",
      section: secGO.id,
      equipeId: eqGO.id,
      debut: 14,
      fin: 24,
      avancement: 0,
      statut: "A_FAIRE", // à venir
      priorite: 3,
      deps: ["T9"],
      ordre: 7,
    },
    {
      key: "T11",
      nom: "Chaînages et arase de l'étage",
      section: secGO.id,
      equipeId: eqGO.id,
      debut: 24,
      fin: 29,
      avancement: 0,
      statut: "A_FAIRE",
      priorite: 3,
      deps: ["T10"],
      labels: [labBeton.id],
      ordre: 8,
    },
    {
      key: "T14",
      nom: "Charpente bois de toiture",
      description: "Fermettes industrielles, contreventement, ancrages anticycloniques.",
      section: secCharp.id,
      equipeId: eqCharp.id,
      debut: 29,
      fin: 40,
      avancement: 0,
      statut: "A_FAIRE",
      priorite: 3,
      deps: ["T11"],
      ouvriers: [ouvFontaine.id, ouvMaillot.id],
      ordre: 0,
    },
    {
      key: "T15",
      nom: "Couverture tôle et étanchéité",
      description: "Tôles nervurées, closoirs, gouttières : fixations renforcées cyclone.",
      section: secCharp.id,
      equipeId: eqCharp.id,
      debut: 40,
      fin: 50,
      avancement: 0,
      statut: "A_FAIRE",
      priorite: 4,
      deps: ["T14"],
      labels: [labSecu.id],
      ouvriers: [ouvFontaine.id, ouvMaillot.id],
      ordre: 1,
    },
  ];

  const idsVilla = new Map<string, string>();
  for (const t of tachesVilla) {
    const created = await db.tache.create({
      data: {
        chantierId: villa.id,
        equipeId: t.equipeId,
        nom: t.nom,
        description: t.description,
        dateDebut: jour(t.debut),
        dateFin: jour(t.fin),
        avancement: t.avancement,
        statut: t.statut,
        priorite: t.priorite,
        sectionId: t.section,
        ordre: t.ordre,
        ...(t.deps.length > 0 && {
          dependances: {
            connect: t.deps.map((k) => ({ id: idsVilla.get(k)! })),
          },
        }),
        ...(t.labels && {
          labels: { create: t.labels.map((labelId) => ({ labelId })) },
        }),
        ...(t.ouvriers && {
          ouvriers: { create: t.ouvriers.map((ouvrierId) => ({ ouvrierId })) },
        }),
      },
    });
    idsVilla.set(t.key, created.id);
    inc("taches");
    inc("dependances", t.deps.length);
  }
  console.log(`  ${tachesVilla.length} tâches Villa (diamant T5 -> T6/T7 -> T8)`);

  // ---- Commande COMMANDEE (livraison prévue dans 5 jours) ----

  await db.commande.create({
    data: {
      chantierId: villa.id,
      fournisseur: "Ravate Professionnel - Le Port",
      reference: "EX-CMD-0451",
      dateCommande: jour(-3),
      dateLivraisonPrevue: jour(5),
      statut: "COMMANDEE",
      mode: "VIREMENT",
      coutTotal: 4819.2,
      note: "Plancher haut RDC : livraison attendue avant le démarrage de la tâche de pose.",
      lignes: {
        create: [
          {
            designation: "Poutrelles précontraintes 12 cm (plancher haut RDC)",
            quantite: 46,
            prixUnitaire: 38.5,
            total: 1771.0,
          },
          {
            designation: "Entrevous hourdis béton 16x20x53",
            quantite: 620,
            prixUnitaire: 2.35,
            total: 1457.0,
          },
          {
            designation: "Treillis soudé ST25C (panneau 6,00 x 2,40 m)",
            quantite: 24,
            prixUnitaire: 42.8,
            total: 1027.2,
          },
          {
            designation: "Ciment CEM II/B-P 32,5 R, sac 35 kg",
            quantite: 60,
            prixUnitaire: 9.4,
            total: 564.0,
          },
        ],
      },
    },
  });
  inc("commandes");

  // ---- Location non clôturée (fin prévue dans 10 jours) ----

  await db.locationPret.create({
    data: {
      designation: "Manuscopique Manitou MT 1440",
      type: "LOCATION",
      fournisseurNom: "Loxam Réunion - Le Port",
      chantierId: villa.id,
      dateDebut: jour(-11),
      dateFinPrevue: jour(10),
      coutJour: 210,
      coutTotal: 4410,
      cloture: false,
      note: "Levage agglos et banches, restitution prévue après coulage du plancher.",
    },
  });
  inc("locations");

  // ---- Finance complète ----
  // Marché ACTIF 180 000 HT, retenue 5 %, délai 30 j, TVA locale 8,5 % (DOM).

  const TVA = 8.5;

  const marcheVilla = await db.marche.create({
    data: {
      espaceId: espTravaux.id,
      chantierId: villa.id,
      reference: "EX-MAR-2026-012",
      natureMarche: "PRIVE",
      modeFacturation: "SITUATION_TRAVAUX",
      maitreOuvrageNom: "M. et Mme Técher-Boyer",
      montantInitialHT: 180000,
      montantCourantHT: 180000,
      typePrix: "FERME",
      tauxRetenueGarantie: 5,
      delaiPaiementJours: 30,
      modeCalculEcheance: "DATE_FACTURE",
      periodiciteSituationsMois: 1,
      dateSignature: jour(-56),
      statut: "ACTIF",
      note: "Marché gros œuvre villa. Retenue de garantie 5 % (loi 71-584).",
      creePar: admin.id,
    },
  });
  inc("marches");

  // Situations : montants dérivés du MOTEUR (src/lib/suivi-commercial-calc.ts)
  // pour rester au centime près cohérents avec ce que l'app recalcule.
  const s1 = calculerSituation({
    montantReferenceHT: 180000,
    avancementCumulePct: 15,
    montantCumuleAnterieurHT: 0,
    tauxRetenueGarantie: 5,
    tauxTVA: TVA,
  });
  const s2 = calculerSituation({
    montantReferenceHT: 180000,
    avancementCumulePct: 32,
    montantCumuleAnterieurHT: s1.montantPeriodeHT,
    tauxRetenueGarantie: 5,
    tauxTVA: TVA,
  });
  const s3 = calculerSituation({
    montantReferenceHT: 180000,
    avancementCumulePct: 45,
    montantCumuleAnterieurHT: s1.montantPeriodeHT + s2.montantPeriodeHT,
    tauxRetenueGarantie: 5,
    tauxTVA: TVA,
  });

  // Situation n°1 : PAYEE et facturée (facture ENVOYEE, réglée avant échéance).
  const factS1 = await db.facture.create({
    data: {
      espaceId: espTravaux.id,
      chantierId: villa.id,
      marcheId: marcheVilla.id,
      type: "SITUATION",
      source: "MANUEL",
      referenceExterne: "EX-FAC-2026-052",
      objet: "Situation n°1 - Villa Hauts de Saint-Paul",
      montantHT: s1.montantPeriodeHT,
      montantTVA: s1.montantTVA,
      montantTTC: s1.netAPayerPeriode,
      retenueGarantieMontant: s1.retenueGarantiePeriode,
      montantPaye: s1.netAPayerPeriode,
      statutEmission: "ENVOYEE",
      statutReglement: "PAYEE",
      dateEmission: jour(-35),
      dateEnvoi: jour(-34),
      dateEcheance: jour(-5),
      datePaiementComplet: jour(-7),
      creePar: admin.id,
    },
  });
  await db.situationTravaux.create({
    data: {
      espaceId: espTravaux.id,
      chantierId: villa.id,
      marcheId: marcheVilla.id,
      base: "BASE_TRAVAUX",
      numeroOrdre: 1,
      periodeDebut: jour(-42),
      periodeFin: jour(-36),
      dateEtablissement: jour(-36),
      avancementCumulePct: 15,
      montantReferenceHT: 180000,
      montantCumuleHT: s1.montantCumuleHT,
      montantCumuleAnterieurHT: 0,
      montantPeriodeHT: s1.montantPeriodeHT,
      retenueGarantiePeriode: s1.retenueGarantiePeriode,
      tauxTVA: TVA,
      netAPayerPeriode: s1.netAPayerPeriode,
      statut: "PAYEE",
      dateVisaMOE: jour(-35),
      factureId: factS1.id,
      creePar: admin.id,
    },
  });
  await db.encaissement.create({
    data: {
      espaceId: espTravaux.id,
      chantierId: villa.id,
      factureId: factS1.id,
      montant: s1.netAPayerPeriode,
      dateEncaissement: jour(-7),
      mode: "VIREMENT",
      reference: "EX-VIR-78123",
      creePar: admin.id,
    },
  });

  // Situation n°2 : FACTUREE, facture PARTIELLEMENT_PAYEE échue depuis 18 jours
  // (palier RELANCE_3) avec un encaissement partiel. Échéance courte assumée
  // (paiement à réception convenu avec le maître d'ouvrage particulier).
  const factS2 = await db.facture.create({
    data: {
      espaceId: espTravaux.id,
      chantierId: villa.id,
      marcheId: marcheVilla.id,
      type: "SITUATION",
      source: "MANUEL",
      referenceExterne: "EX-FAC-2026-058",
      objet: "Situation n°2 - Villa Hauts de Saint-Paul",
      montantHT: s2.montantPeriodeHT,
      montantTVA: s2.montantTVA,
      montantTTC: s2.netAPayerPeriode,
      retenueGarantieMontant: s2.retenueGarantiePeriode,
      montantPaye: 15000,
      statutEmission: "ENVOYEE",
      statutReglement: "PARTIELLEMENT_PAYEE",
      dateEmission: jour(-25),
      dateEnvoi: jour(-24),
      dateEcheance: jour(-18),
      creePar: admin.id,
    },
  });
  await db.situationTravaux.create({
    data: {
      espaceId: espTravaux.id,
      chantierId: villa.id,
      marcheId: marcheVilla.id,
      base: "BASE_TRAVAUX",
      numeroOrdre: 2,
      periodeDebut: jour(-36),
      periodeFin: jour(-27),
      dateEtablissement: jour(-27),
      avancementCumulePct: 32,
      montantReferenceHT: 180000,
      montantCumuleHT: s2.montantCumuleHT,
      montantCumuleAnterieurHT: s1.montantPeriodeHT,
      montantPeriodeHT: s2.montantPeriodeHT,
      retenueGarantiePeriode: s2.retenueGarantiePeriode,
      tauxTVA: TVA,
      netAPayerPeriode: s2.netAPayerPeriode,
      statut: "FACTUREE",
      dateVisaMOE: jour(-26),
      factureId: factS2.id,
      creePar: admin.id,
    },
  });
  await db.encaissement.create({
    data: {
      espaceId: espTravaux.id,
      chantierId: villa.id,
      factureId: factS2.id,
      montant: 15000,
      dateEncaissement: jour(-6),
      mode: "VIREMENT",
      reference: "EX-VIR-79410 (acompte partiel)",
      creePar: admin.id,
    },
  });

  // Situation n°3 : VISEE_MOE il y a 10 jours, JAMAIS facturée
  // (déclenche SITUATION_A_FACTURER au balayage des relances).
  await db.situationTravaux.create({
    data: {
      espaceId: espTravaux.id,
      chantierId: villa.id,
      marcheId: marcheVilla.id,
      base: "BASE_TRAVAUX",
      numeroOrdre: 3,
      periodeDebut: jour(-27),
      periodeFin: jour(-12),
      dateEtablissement: jour(-11),
      avancementCumulePct: 45,
      montantReferenceHT: 180000,
      montantCumuleHT: s3.montantCumuleHT,
      montantCumuleAnterieurHT: s1.montantPeriodeHT + s2.montantPeriodeHT,
      montantPeriodeHT: s3.montantPeriodeHT,
      retenueGarantiePeriode: s3.retenueGarantiePeriode,
      tauxTVA: TVA,
      netAPayerPeriode: s3.netAPayerPeriode,
      statut: "VISEE_MOE",
      dateVisaMOE: jour(-10),
      creePar: admin.id,
    },
  });
  inc("situations", 3);

  // Retenue de garantie : cumul des retenues des situations FACTURÉES (n°1 + 2),
  // échéance de libération dans 20 jours -> palier RETENUE_LIBERABLE.
  await db.retenueGarantie.create({
    data: {
      espaceId: espTravaux.id,
      chantierId: villa.id,
      marcheId: marcheVilla.id,
      tauxPct: 5,
      montantRetenuCumul:
        Math.round((s1.retenueGarantiePeriode + s2.retenueGarantiePeriode) * 100) / 100,
      forme: "RETENUE_FONDS",
      dateDebut: jour(-35),
      dateEcheanceLiberation: jour(20),
      statut: "RETENUE",
    },
  });
  inc("retenues");

  // Facture de SOLDE d'un petit marché préparatoire, ENVOYEE, échue depuis
  // 35 jours, NON_PAYEE -> palier MISE_EN_DEMEURE.
  await db.facture.create({
    data: {
      espaceId: espTravaux.id,
      chantierId: villa.id,
      type: "SOLDE",
      source: "MANUEL",
      referenceExterne: "EX-FAC-2026-041",
      objet: "Solde - marché préparatoire (démolition et confortement du talus)",
      montantHT: 6800,
      montantTVA: 578,
      montantTTC: 7378,
      montantPaye: 0,
      statutEmission: "ENVOYEE",
      statutReglement: "NON_PAYEE",
      dateEmission: jour(-65),
      dateEnvoi: jour(-64),
      dateEcheance: jour(-35),
      creePar: admin.id,
    },
  });
  inc("factures", 3);
  inc("encaissements", 2);

  // ---- Labo : 2 prélèvements béton, échéances J+7 / J+28 ----
  // Seuils = résistance caractéristique cylindre de la classe prescrite
  // (C25/30 -> 25 MPa, C30/37 -> 30 MPa), comme seuilDepuisClasse().

  const prelBet1 = await db.prelevementLabo.create({
    data: {
      espaceId: espTravaux.id,
      chantierId: villa.id,
      reference: "EX-BET-001",
      materiau: "Béton C25/30 XC1 (semelles et plots de fondation)",
      origine: "Toupie Holcim Réunion, BL 78542",
      datePrelevement: jour(-26),
      preleveur: "Jean-Yves Payet",
      classePrescrite: "C25/30",
      note: "Prélèvement au coulage des fondations, affaissement mesuré S3.",
      creePar: admin.id,
    },
  });
  const [eprB1A, eprB1B] = await Promise.all([
    db.eprouvetteLabo.create({
      data: {
        prelevementId: prelBet1.id,
        code: "EX-BET-001-A",
        geometrie: "Cylindre 16x32",
        dateFabrication: jour(-26),
        conditionsCure: "Bassin à 20 °C",
      },
    }),
    db.eprouvetteLabo.create({
      data: {
        prelevementId: prelBet1.id,
        code: "EX-BET-001-B",
        geometrie: "Cylindre 16x32",
        dateFabrication: jour(-26),
        conditionsCure: "Bassin à 20 °C",
      },
    }),
  ]);

  const prelBet2 = await db.prelevementLabo.create({
    data: {
      espaceId: espTravaux.id,
      chantierId: villa.id,
      reference: "EX-BET-002",
      materiau: "Béton C30/37 XC4 (poteaux et poutres RDC)",
      origine: "Toupie Holcim Réunion, BL 79018",
      datePrelevement: jour(-10),
      preleveur: "Sully Hoarau",
      classePrescrite: "C30/37",
      note: "Coulage des poteaux RDC, temps couvert, 27 °C.",
      creePar: admin.id,
    },
  });
  const [eprB2A, eprB2B, eprB2C] = await Promise.all([
    db.eprouvetteLabo.create({
      data: {
        prelevementId: prelBet2.id,
        code: "EX-BET-002-A",
        geometrie: "Cylindre 16x32",
        dateFabrication: jour(-10),
        conditionsCure: "Bassin à 20 °C",
      },
    }),
    db.eprouvetteLabo.create({
      data: {
        prelevementId: prelBet2.id,
        code: "EX-BET-002-B",
        geometrie: "Cylindre 16x32",
        dateFabrication: jour(-10),
        conditionsCure: "Bassin à 20 °C",
      },
    }),
    db.eprouvetteLabo.create({
      data: {
        prelevementId: prelBet2.id,
        code: "EX-BET-002-C",
        geometrie: "Cylindre 16x32",
        dateFabrication: jour(-10),
        conditionsCure: "Bassin à 20 °C",
      },
    }),
  ]);
  inc("prelevements", 2);
  inc("eprouvettes", 5);

  await Promise.all([
    // 1. J+7 VALIDE et conforme (au-dessus du seuil).
    db.essaiLabo.create({
      data: {
        prelevementId: prelBet1.id,
        eprouvetteId: eprB1A.id,
        type: "Compression",
        norme: "NF EN 12390-3",
        echeance: jour(-19),
        statut: "VALIDE",
        operateur: "OptimusLab",
        dateRealisation: jour(-19),
        valeur: 27.4,
        unite: "MPa",
        seuil: 25,
        conforme: true,
        note: "Écrasement d'information à 7 jours : montée en résistance rapide.",
        creePar: admin.id,
      },
    }),
    // 2. J+28 à échéance dans 2 jours (PLANIFIE).
    db.essaiLabo.create({
      data: {
        prelevementId: prelBet1.id,
        eprouvetteId: eprB1B.id,
        type: "Compression",
        norme: "NF EN 12390-3",
        echeance: jour(2),
        statut: "PLANIFIE",
        unite: "MPa",
        seuil: 25,
        note: "Écrasement normatif à 28 jours (verdict de conformité).",
        creePar: admin.id,
      },
    }),
    // 3. J+7 ÉCHU depuis 3 jours, encore PLANIFIE -> relance ESSAI_ECHU.
    db.essaiLabo.create({
      data: {
        prelevementId: prelBet2.id,
        eprouvetteId: eprB2B.id,
        type: "Compression",
        norme: "NF EN 12390-3",
        echeance: jour(-3),
        statut: "PLANIFIE",
        unite: "MPa",
        seuil: 30,
        note: "Écrasement à 7 jours en attente : presse indisponible.",
        creePar: admin.id,
      },
    }),
    // 4. VALIDE NON CONFORME : écrasement anticipé sous le seuil de classe.
    db.essaiLabo.create({
      data: {
        prelevementId: prelBet2.id,
        eprouvetteId: eprB2A.id,
        type: "Compression",
        norme: "NF EN 12390-3",
        echeance: jour(-7),
        statut: "VALIDE",
        operateur: "OptimusLab",
        dateRealisation: jour(-7),
        valeur: 16.2,
        unite: "MPa",
        seuil: 30,
        conforme: false,
        note:
          "Écrasement anticipé (J+3) demandé avant décoffrage de la poutre : " +
          "résultat sous le seuil de la classe, contre-essai à 28 jours impératif.",
        creePar: admin.id,
      },
    }),
    // 5. J+28 du second prélèvement (planifié, hors fenêtre de préavis).
    db.essaiLabo.create({
      data: {
        prelevementId: prelBet2.id,
        eprouvetteId: eprB2C.id,
        type: "Compression",
        norme: "NF EN 12390-3",
        echeance: jour(18),
        statut: "PLANIFIE",
        unite: "MPa",
        seuil: 30,
        note: "Écrasement normatif à 28 jours.",
        creePar: admin.id,
      },
    }),
  ]);
  inc("essais", 5);
  console.log("  Finance + labo Villa en place");

  // ===========================================================================
  // PROJET 2 : EX Résidence Les Filaos (second œuvre, EN_COURS, ~60 %)
  // ===========================================================================

  const filaos = await db.chantier.create({
    data: {
      nom: "EX Résidence Les Filaos",
      adresse: "12 rue des Filaos, 97434 Saint-Gilles-les-Bains, La Réunion",
      description:
        "Second œuvre complet de 8 logements en accession (T2 et T3) : " +
        "distribution en cloisons sèches, faux plafonds des circulations, " +
        "incorporations électriques, plomberie sanitaire, enduits, peinture " +
        "et sols souples. Livraison des logements par plateaux, en site " +
        "occupé côté rue : approvisionnements en horaires décalés.",
      statut: "EN_COURS",
      type: "CHANTIER",
      espaceId: espTravaux.id,
      budgetEspeces: 3000,
      budgetVirement: 95000,
      dateDebut: jour(-35),
      dateFin: jour(30),
      chefId: admin.id,
    },
  });
  inc("chantiers");
  console.log(`  Chantier ${filaos.nom}`);

  const eqSO = await db.equipe.create({
    data: {
      nom: "EX Second œuvre - Les Filaos",
      chantierId: filaos.id,
      espaceId: espTravaux.id,
    },
  });
  inc("equipes");

  const [ouvRiviere, ouvDijoux, ouvBoyer, ouvLebon] = await Promise.all([
    mkOuvrier({
      nom: "Rivière",
      prenom: "Fabrice",
      telephone: "0692 55 02 11",
      typeContrat: "MOIS",
      tarifBase: 2500,
      modePaie: "MOIS",
      equipeId: eqSO.id,
      espaceId: espTravaux.id,
      notes: "[EX] Chef d'équipe plaquiste, lecture de plans de calepinage.",
    }),
    mkOuvrier({
      nom: "Dijoux",
      prenom: "Anaïs",
      telephone: "0692 55 02 26",
      typeContrat: "JOUR",
      tarifBase: 90,
      modePaie: "SEMAINE",
      equipeId: eqSO.id,
      espaceId: espTravaux.id,
      notes: "[EX] Peintre finisseuse, enduits et bandes soignés.",
    }),
    mkOuvrier({
      nom: "Boyer",
      prenom: "Wilfrid",
      telephone: "0693 55 02 39",
      typeContrat: "JOUR",
      tarifBase: 88,
      modePaie: "SEMAINE",
      equipeId: eqSO.id,
      espaceId: espTravaux.id,
      notes: "[EX] Plombier sanitaire, habilitation soudure cuivre.",
    }),
    mkOuvrier({
      nom: "Lebon",
      prenom: "Jérémy",
      telephone: "0693 55 02 44",
      typeContrat: "SEMAINE",
      tarifBase: 540,
      modePaie: "SEMAINE",
      equipeId: eqSO.id,
      espaceId: espTravaux.id,
      notes: "[EX] Poseur de sols souples et plinthes.",
    }),
  ]);
  inc("ouvriers", 4);

  const [secCloisons, secTech] = await Promise.all([
    db.section.create({
      data: { chantierId: filaos.id, nom: "Cloisons et plafonds", couleur: "#0e7490", ordre: 0 },
    }),
    db.section.create({
      data: { chantierId: filaos.id, nom: "Lots techniques et finitions", couleur: "#7c3aed", ordre: 1 },
    }),
  ]);
  inc("sections", 2);

  const labFinitions = await db.label.create({
    data: { nom: "EX Finitions", couleur: "#7c3aed", chantierId: filaos.id },
  });
  const labSiteOccupe = await db.label.create({
    data: { nom: "EX Site occupé", couleur: "#ea580c", chantierId: filaos.id },
  });
  inc("labels", 2);

  // 8 tâches en chaîne simple + 1 dépendance croisée (F5 dépend de F2 ET F4).
  const tachesFilaos: TacheDef[] = [
    {
      key: "F1",
      nom: "Distribution des cloisons placo (niveaux 1 et 2)",
      section: secCloisons.id,
      equipeId: eqSO.id,
      debut: -35,
      fin: -24,
      avancement: 100,
      statut: "TERMINEE",
      priorite: 2,
      deps: [],
      ouvriers: [ouvRiviere.id],
      ordre: 0,
    },
    {
      key: "F2",
      nom: "Faux plafonds des circulations",
      section: secCloisons.id,
      equipeId: eqSO.id,
      debut: -24,
      fin: -17,
      avancement: 100,
      statut: "TERMINEE",
      priorite: 3,
      deps: ["F1"],
      ordre: 1,
    },
    {
      key: "F3",
      nom: "Incorporations électriques (gaines et boîtiers)",
      section: secTech.id,
      equipeId: eqSO.id,
      debut: -22,
      fin: -13,
      avancement: 100,
      statut: "TERMINEE",
      priorite: 2,
      deps: ["F1"],
      ordre: 0,
    },
    {
      key: "F4",
      nom: "Plomberie : alimentations et évacuations des salles d'eau",
      section: secTech.id,
      equipeId: eqSO.id,
      debut: -16,
      fin: 1,
      avancement: 85,
      statut: "EN_COURS",
      priorite: 1,
      deps: ["F3"],
      ouvriers: [ouvBoyer.id],
      ordre: 1,
    },
    {
      key: "F5",
      nom: "Fermeture des cloisons et bandes",
      description:
        "Dépendance croisée : attend les plafonds (F2) ET la plomberie en cloison (F4).",
      section: secCloisons.id,
      equipeId: eqSO.id,
      debut: -2,
      fin: 6,
      avancement: 55,
      statut: "EN_COURS",
      priorite: 2,
      deps: ["F2", "F4"], // dépendance croisée entre sections
      ouvriers: [ouvRiviere.id, ouvDijoux.id],
      ordre: 2,
    },
    {
      key: "F6",
      nom: "Enduits et ponçage",
      section: secCloisons.id,
      equipeId: eqSO.id,
      debut: 6,
      fin: 13,
      avancement: 0,
      statut: "A_FAIRE",
      priorite: 3,
      deps: ["F5"],
      ouvriers: [ouvDijoux.id],
      ordre: 3,
    },
    {
      key: "F7",
      nom: "Peinture des logements T1 à T8",
      section: secTech.id,
      equipeId: eqSO.id,
      debut: 13,
      fin: 24,
      avancement: 0,
      statut: "A_FAIRE",
      priorite: 3,
      deps: ["F6"],
      labels: [labFinitions.id],
      ouvriers: [ouvDijoux.id, ouvLebon.id],
      ordre: 2,
    },
    {
      key: "F8",
      nom: "Sols souples et plinthes",
      section: secTech.id,
      equipeId: eqSO.id,
      debut: 24,
      fin: 30,
      avancement: 0,
      statut: "A_FAIRE",
      priorite: 4,
      deps: ["F7"],
      labels: [labFinitions.id, labSiteOccupe.id],
      ouvriers: [ouvLebon.id],
      ordre: 3,
    },
  ];

  const idsFilaos = new Map<string, string>();
  for (const t of tachesFilaos) {
    const created = await db.tache.create({
      data: {
        chantierId: filaos.id,
        equipeId: t.equipeId,
        nom: t.nom,
        description: t.description,
        dateDebut: jour(t.debut),
        dateFin: jour(t.fin),
        avancement: t.avancement,
        statut: t.statut,
        priorite: t.priorite,
        sectionId: t.section,
        ordre: t.ordre,
        ...(t.deps.length > 0 && {
          dependances: {
            connect: t.deps.map((k) => ({ id: idsFilaos.get(k)! })),
          },
        }),
        ...(t.labels && {
          labels: { create: t.labels.map((labelId) => ({ labelId })) },
        }),
        ...(t.ouvriers && {
          ouvriers: { create: t.ouvriers.map((ouvrierId) => ({ ouvrierId })) },
        }),
      },
    });
    idsFilaos.set(t.key, created.id);
    inc("taches");
    inc("dependances", t.deps.length);
  }
  console.log(`  ${tachesFilaos.length} tâches Filaos (chaîne + croisée F2/F4 -> F5)`);

  // ---- Finance simple Filaos ----

  const marcheFilaos = await db.marche.create({
    data: {
      espaceId: espTravaux.id,
      chantierId: filaos.id,
      reference: "EX-MAR-2026-019",
      natureMarche: "PRIVE",
      modeFacturation: "SITUATION_TRAVAUX",
      maitreOuvrageNom: "SCI Les Filaos (M. Ah-Hot)",
      montantInitialHT: 95000,
      montantCourantHT: 95000,
      typePrix: "FERME",
      tauxRetenueGarantie: 5,
      delaiPaiementJours: 30,
      modeCalculEcheance: "DATE_FACTURE",
      periodiciteSituationsMois: 1,
      dateSignature: jour(-49),
      statut: "ACTIF",
      creePar: admin.id,
    },
  });
  inc("marches");

  // Devis complémentaire ENVOYE il y a 20 jours, sans réponse
  // -> palier DEVIS_SANS_REPONSE (seuil : 14 jours).
  await db.devis.create({
    data: {
      espaceId: espTravaux.id,
      chantierId: filaos.id,
      marcheId: marcheFilaos.id,
      source: "MANUEL",
      referenceExterne: "EX-DEV-2026-027",
      objet: "Travaux complémentaires : placards et meubles vasque des 8 logements",
      montantHT: 12400,
      montantTVA: 1054,
      montantTTC: 13454,
      statut: "ENVOYE",
      dateEmission: jour(-21),
      dateEnvoi: jour(-20),
      dateValidite: jour(10),
      creePar: admin.id,
    },
  });
  inc("devis");

  // Situation ACCEPTEE jamais facturée -> palier SITUATION_A_FACTURER.
  const sf1 = calculerSituation({
    montantReferenceHT: 95000,
    avancementCumulePct: 40,
    montantCumuleAnterieurHT: 0,
    tauxRetenueGarantie: 5,
    tauxTVA: TVA,
  });
  await db.situationTravaux.create({
    data: {
      espaceId: espTravaux.id,
      chantierId: filaos.id,
      marcheId: marcheFilaos.id,
      base: "BASE_TRAVAUX",
      numeroOrdre: 1,
      periodeDebut: jour(-35),
      periodeFin: jour(-15),
      dateEtablissement: jour(-14),
      avancementCumulePct: 40,
      montantReferenceHT: 95000,
      montantCumuleHT: sf1.montantCumuleHT,
      montantCumuleAnterieurHT: 0,
      montantPeriodeHT: sf1.montantPeriodeHT,
      retenueGarantiePeriode: sf1.retenueGarantiePeriode,
      tauxTVA: TVA,
      netAPayerPeriode: sf1.netAPayerPeriode,
      statut: "ACCEPTEE",
      dateVisaMOE: jour(-12),
      creePar: admin.id,
    },
  });
  inc("situations");

  // Facture d'acompte EMISE, échue depuis 9 jours -> palier RELANCE_2
  // (échéance = émission + 30 jours, cohérente avec le délai du marché).
  await db.facture.create({
    data: {
      espaceId: espTravaux.id,
      chantierId: filaos.id,
      marcheId: marcheFilaos.id,
      type: "ACOMPTE",
      source: "MANUEL",
      referenceExterne: "EX-FAC-2026-063",
      objet: "Acompte de démarrage 15 % - Résidence Les Filaos",
      montantHT: 14250,
      montantTVA: 1211.25,
      montantTTC: 15461.25,
      montantPaye: 0,
      statutEmission: "EMISE",
      statutReglement: "NON_PAYEE",
      dateEmission: jour(-39),
      dateEcheance: jour(-9),
      creePar: admin.id,
    },
  });
  inc("factures");

  // ===========================================================================
  // PROJET 3 : EX Extension École de Bras-Panon (études, PLANIFIE, EcoTech)
  // ===========================================================================

  const ecole = await db.chantier.create({
    data: {
      nom: "EX Extension École de Bras-Panon",
      adresse:
        "École primaire Célimène Gaudieux, 8 rue de la Rivière-des-Roches, 97412 Bras-Panon, La Réunion",
      description:
        "Mission de maîtrise d'œuvre pour l'extension d'une école primaire : " +
        "3 salles de classe et un préau, structure mixte béton et bois, " +
        "conception bioclimatique (ventilation traversante, protections " +
        "solaires, confort thermique sans climatisation). Mission de base " +
        "ESQ, APS, APD (avec dépôt du permis de construire) puis PRO-DCE. " +
        "Démarrage des études dans une semaine.",
      statut: "PLANIFIE",
      type: "ETUDE",
      espaceId: espBE.id,
      budgetEspeces: 0,
      budgetVirement: 28000,
      dateDebut: jour(7),
      dateFin: jour(130),
      chefId: admin.id,
    },
  });
  inc("chantiers");
  console.log(`  Chantier ${ecole.nom}`);

  const eqBE = await db.equipe.create({
    data: {
      nom: "EX Bureau d'études - Bras-Panon",
      chantierId: ecole.id,
      espaceId: espBE.id,
    },
  });
  inc("equipes");

  const [ouvLauret, ouvSautron, ouvVitry] = await Promise.all([
    mkOuvrier({
      nom: "Lauret",
      prenom: "Émilie",
      telephone: "0692 55 03 15",
      typeContrat: "MOIS",
      tarifBase: 3200,
      modePaie: "MOIS",
      equipeId: eqBE.id,
      espaceId: espBE.id,
      notes: "[EX] Ingénieure structure, référente du projet Bras-Panon.",
    }),
    mkOuvrier({
      nom: "Sautron",
      prenom: "Mathieu",
      telephone: "0692 55 03 28",
      typeContrat: "MOIS",
      tarifBase: 2450,
      modePaie: "MOIS",
      equipeId: eqBE.id,
      espaceId: espBE.id,
      notes: "[EX] Projeteur BIM (Revit), plans et maquette numérique.",
    }),
    mkOuvrier({
      nom: "Vitry",
      prenom: "Camille",
      telephone: "0693 55 03 41",
      typeContrat: "FORFAIT",
      tarifBase: 2800,
      modePaie: "MOIS",
      equipeId: eqBE.id,
      espaceId: espBE.id,
      notes: "[EX] Économiste de la construction et suivi des essais R&D labo.",
    }),
  ]);
  inc("ouvriers", 3);

  const secEtudes = await db.section.create({
    data: {
      chantierId: ecole.id,
      nom: "Mission de base (ESQ à DCE)",
      couleur: "#166534",
      ordre: 0,
    },
  });
  inc("sections");

  // 6 tâches de phases d'études enchaînées, démarrage dans 1 semaine.
  const tachesEcole: TacheDef[] = [
    {
      key: "E1",
      nom: "Visite du site, relevés et données d'entrée",
      section: secEtudes.id,
      equipeId: eqBE.id,
      debut: 7,
      fin: 11,
      avancement: 0,
      statut: "A_FAIRE",
      priorite: 2,
      deps: [],
      ouvriers: [ouvLauret.id, ouvSautron.id],
      ordre: 0,
    },
    {
      key: "E2",
      nom: "ESQ : esquisse et faisabilité",
      section: secEtudes.id,
      equipeId: eqBE.id,
      debut: 11,
      fin: 25,
      avancement: 0,
      statut: "A_FAIRE",
      priorite: 2,
      deps: ["E1"],
      ouvriers: [ouvLauret.id],
      ordre: 1,
    },
    {
      key: "E3",
      nom: "APS : avant-projet sommaire",
      section: secEtudes.id,
      equipeId: eqBE.id,
      debut: 25,
      fin: 46,
      avancement: 0,
      statut: "A_FAIRE",
      priorite: 3,
      deps: ["E2"],
      ouvriers: [ouvSautron.id],
      ordre: 2,
    },
    {
      key: "E4",
      nom: "APD : avant-projet définitif et dépôt du permis de construire",
      section: secEtudes.id,
      equipeId: eqBE.id,
      debut: 46,
      fin: 74,
      avancement: 0,
      statut: "A_FAIRE",
      priorite: 1,
      deps: ["E3"],
      ouvriers: [ouvLauret.id, ouvSautron.id],
      ordre: 3,
    },
    {
      key: "E5",
      nom: "PRO : projet et dimensionnement de la structure",
      section: secEtudes.id,
      equipeId: eqBE.id,
      debut: 74,
      fin: 102,
      avancement: 0,
      statut: "A_FAIRE",
      priorite: 2,
      deps: ["E4"],
      ouvriers: [ouvLauret.id],
      ordre: 4,
    },
    {
      key: "E6",
      nom: "Constitution du DCE et estimation définitive",
      section: secEtudes.id,
      equipeId: eqBE.id,
      debut: 102,
      fin: 123,
      avancement: 0,
      statut: "A_FAIRE",
      priorite: 3,
      deps: ["E5"],
      ouvriers: [ouvVitry.id],
      ordre: 5,
    },
  ];

  const idsEcole = new Map<string, string>();
  for (const t of tachesEcole) {
    const created = await db.tache.create({
      data: {
        chantierId: ecole.id,
        equipeId: t.equipeId,
        nom: t.nom,
        dateDebut: jour(t.debut),
        dateFin: jour(t.fin),
        avancement: t.avancement,
        statut: t.statut,
        priorite: t.priorite,
        sectionId: t.section,
        ordre: t.ordre,
        ...(t.deps.length > 0 && {
          dependances: {
            connect: t.deps.map((k) => ({ id: idsEcole.get(k)! })),
          },
        }),
        ...(t.ouvriers && {
          ouvriers: { create: t.ouvriers.map((ouvrierId) => ({ ouvrierId })) },
        }),
      },
    });
    idsEcole.set(t.key, created.id);
    inc("taches");
    inc("dependances", t.deps.length);
  }
  console.log(`  ${tachesEcole.length} tâches École (chaîne ESQ -> DCE)`);

  // Phases d'honoraires (module BE) : mêmes jalons que le planning.
  await Promise.all([
    db.phaseEtude.create({
      data: {
        chantierId: ecole.id,
        code: "ESQ",
        libelle: "Esquisse et faisabilité",
        montantVendu: 4200,
        budgetHeures: 50,
        dateDebut: jour(11),
        dateFin: jour(25),
        ordre: 0,
      },
    }),
    db.phaseEtude.create({
      data: {
        chantierId: ecole.id,
        code: "APS",
        libelle: "Avant-projet sommaire",
        montantVendu: 6300,
        budgetHeures: 75,
        dateDebut: jour(25),
        dateFin: jour(46),
        ordre: 1,
      },
    }),
    db.phaseEtude.create({
      data: {
        chantierId: ecole.id,
        code: "APD",
        libelle: "Avant-projet définitif et permis de construire",
        montantVendu: 8400,
        budgetHeures: 100,
        dateDebut: jour(46),
        dateFin: jour(74),
        ordre: 2,
      },
    }),
    db.phaseEtude.create({
      data: {
        chantierId: ecole.id,
        code: "PRO",
        libelle: "Projet et dimensionnement",
        montantVendu: 9100,
        budgetHeures: 110,
        dateDebut: jour(74),
        dateFin: jour(102),
        ordre: 3,
      },
    }),
  ]);
  inc("phases", 4);

  // Marché d'honoraires encore BROUILLON (notification de la commune attendue).
  const marcheEcole = await db.marche.create({
    data: {
      espaceId: espBE.id,
      chantierId: ecole.id,
      reference: "EX-MAR-2026-021",
      natureMarche: "PUBLIC",
      modeFacturation: "JALON_PHASE",
      maitreOuvrageNom: "Commune de Bras-Panon",
      montantInitialHT: 28000,
      montantCourantHT: 28000,
      typePrix: "FERME",
      tauxRetenueGarantie: 0,
      delaiPaiementJours: 30,
      modeCalculEcheance: "DATE_FACTURE",
      statut: "BROUILLON",
      note: "Marché d'honoraires en attente de notification par la commune.",
      creePar: admin.id,
    },
  });
  inc("marches");

  // Devis d'honoraires ACCEPTE (base du futur marché).
  await db.devis.create({
    data: {
      espaceId: espBE.id,
      chantierId: ecole.id,
      marcheId: marcheEcole.id,
      source: "MANUEL",
      referenceExterne: "EX-DEV-2026-024",
      objet:
        "Honoraires de maîtrise d'œuvre : extension de l'école de Bras-Panon (mission de base)",
      montantHT: 28000,
      montantTVA: 2380,
      montantTTC: 30380,
      statut: "ACCEPTE",
      dateEmission: jour(-30),
      dateEnvoi: jour(-28),
      dateValidite: jour(60),
      dateAcceptation: jour(-9),
      creePar: admin.id,
    },
  });
  inc("devis");

  // ---- Labo R&D : 2 formulations terre-chanvre, essais VALIDES comparables ----

  const [formF1, formF2] = await Promise.all([
    db.formulationLabo.create({
      data: {
        espaceId: espBE.id,
        nom: "EX Terre-chanvre F1",
        campagne: "EX 2026-T3",
        description:
          "Formulation de référence : brique de terre crue allégée à la " +
          "chènevotte, dosage 15 % en volume. Objectif : cloisons intérieures " +
          "à fort déphasage thermique.",
        composition:
          "Terre argileuse de Bras-Panon tamisée 0/4, chènevotte 15 % vol., eau 28 % masse.",
        creePar: admin.id,
      },
    }),
    db.formulationLabo.create({
      data: {
        espaceId: espBE.id,
        nom: "EX Terre-chanvre F2",
        campagne: "EX 2026-T3",
        description:
          "Variante allégée : dosage en chènevotte porté à 25 % en volume. " +
          "Objectif : gagner en conductivité thermique en acceptant une " +
          "résistance mécanique plus faible.",
        composition:
          "Terre argileuse de Bras-Panon tamisée 0/4, chènevotte 25 % vol., eau 31 % masse.",
        creePar: admin.id,
      },
    }),
  ]);
  inc("formulations", 2);

  const prelF1 = await db.prelevementLabo.create({
    data: {
      espaceId: espBE.id,
      formulationId: formF1.id,
      reference: "EX-RD-001",
      materiau: "Terre-chanvre (brique extrudée F1)",
      origine: "Gâchée n°3, malaxeur planétaire du labo",
      datePrelevement: jour(-30),
      preleveur: "Camille Vitry",
      note: "Séchage 21 jours en salle ventilée avant essais.",
      creePar: admin.id,
    },
  });
  const prelF2 = await db.prelevementLabo.create({
    data: {
      espaceId: espBE.id,
      formulationId: formF2.id,
      reference: "EX-RD-002",
      materiau: "Terre-chanvre (brique extrudée F2)",
      origine: "Gâchée n°4, malaxeur planétaire du labo",
      datePrelevement: jour(-28),
      preleveur: "Camille Vitry",
      note: "Séchage 21 jours en salle ventilée avant essais.",
      creePar: admin.id,
    },
  });
  inc("prelevements", 2);

  const [eprF1A, eprF1B, eprF2A, eprF2B] = await Promise.all([
    db.eprouvetteLabo.create({
      data: {
        prelevementId: prelF1.id,
        code: "EX-RD-001-A",
        geometrie: "Cube 10x10x10 cm",
        dateFabrication: jour(-30),
        conditionsCure: "Salle ventilée 25 °C, HR 65 %",
      },
    }),
    db.eprouvetteLabo.create({
      data: {
        prelevementId: prelF1.id,
        code: "EX-RD-001-B",
        geometrie: "Plaque 30x30x5 cm",
        dateFabrication: jour(-30),
        conditionsCure: "Salle ventilée 25 °C, HR 65 %",
      },
    }),
    db.eprouvetteLabo.create({
      data: {
        prelevementId: prelF2.id,
        code: "EX-RD-002-A",
        geometrie: "Cube 10x10x10 cm",
        dateFabrication: jour(-28),
        conditionsCure: "Salle ventilée 25 °C, HR 65 %",
      },
    }),
    db.eprouvetteLabo.create({
      data: {
        prelevementId: prelF2.id,
        code: "EX-RD-002-B",
        geometrie: "Plaque 30x30x5 cm",
        dateFabrication: jour(-28),
        conditionsCure: "Salle ventilée 25 °C, HR 65 %",
      },
    }),
  ]);
  inc("eprouvettes", 4);

  // Essais comparables : mêmes types, valeurs différentes -> vue comparative.
  await Promise.all([
    db.essaiLabo.create({
      data: {
        prelevementId: prelF1.id,
        eprouvetteId: eprF1A.id,
        type: "Compression",
        protocole: "Protocole interne OptimusLab TC-01, d'après XP P13-901",
        echeance: jour(-9),
        statut: "VALIDE",
        operateur: "Camille Vitry",
        dateRealisation: jour(-9),
        valeur: 1.62,
        unite: "MPa",
        note: "Rupture ductile, fissuration progressive.",
        creePar: admin.id,
      },
    }),
    db.essaiLabo.create({
      data: {
        prelevementId: prelF1.id,
        eprouvetteId: eprF1B.id,
        type: "Conductivité thermique",
        protocole: "Méthode du fil chaud, guide Cerema matériaux biosourcés",
        echeance: jour(-7),
        statut: "VALIDE",
        operateur: "Camille Vitry",
        dateRealisation: jour(-7),
        valeur: 0.091,
        unite: "W/(m.K)",
        note: "Mesure à 25 °C, éprouvette stabilisée en masse.",
        creePar: admin.id,
      },
    }),
    db.essaiLabo.create({
      data: {
        prelevementId: prelF2.id,
        eprouvetteId: eprF2A.id,
        type: "Compression",
        protocole: "Protocole interne OptimusLab TC-01, d'après XP P13-901",
        echeance: jour(-8),
        statut: "VALIDE",
        operateur: "Camille Vitry",
        dateRealisation: jour(-8),
        valeur: 1.18,
        unite: "MPa",
        note: "Plus déformable que F1, cohérent avec le dosage en chènevotte.",
        creePar: admin.id,
      },
    }),
    db.essaiLabo.create({
      data: {
        prelevementId: prelF2.id,
        eprouvetteId: eprF2B.id,
        type: "Conductivité thermique",
        protocole: "Méthode du fil chaud, guide Cerema matériaux biosourcés",
        echeance: jour(-6),
        statut: "VALIDE",
        operateur: "Camille Vitry",
        dateRealisation: jour(-6),
        valeur: 0.072,
        unite: "W/(m.K)",
        note: "Gain net en isolation par rapport à F1 (-21 %).",
        creePar: admin.id,
      },
    }),
  ]);
  inc("essais", 4);
  console.log("  Formulations R&D et essais comparatifs en place");

  // ---- Récapitulatif ----

  console.log("\nSeed EX terminé. Comptes créés :");
  for (const [k, v] of Object.entries(compteurs).sort()) {
    console.log(`  ${k.padEnd(14)} ${v}`);
  }
}

seed()
  .catch((e) => {
    console.error("Erreur seed EX :", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
