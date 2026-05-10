/**
 * Génère des données de démo (5-6 chantiers fictifs avec équipes, matériel,
 * commandes, locations, sorties, pointages, incidents, demandes, rapports).
 *
 * Usage : npx tsx scripts/seed-demo.ts
 *
 * - Préserve les utilisateurs et ouvriers existants
 * - Réutilise les ouvriers existants pour les répartir dans les nouvelles équipes
 * - Skip si des chantiers "[DEMO]" existent déjà (pour ne pas dupliquer)
 *
 * Pour rejouer après modif : supprimer manuellement les chantiers [DEMO]
 *   docker exec -i ogc-postgres psql -U ogc -d ogc -c "DELETE FROM \"Chantier\" WHERE nom LIKE '[DEMO]%';"
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";

config(); // Charge .env

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set in .env");
}

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

// ---------- Helpers ----------

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function daysAgo(n: number, hoursOffset = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hoursOffset, 0, 0, 0);
  return d;
}
function dayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

// ---------- Données fictives ----------

const CHANTIERS_DEMO = [
  {
    nom: "[DEMO] Villa Mont Vert",
    adresse: "12 chemin des Hauts-Bois, 64200 Biarritz",
    description:
      "Construction neuve, maison individuelle 180 m², R+1, ossature béton + bardage bois.",
    statut: "EN_COURS",
    budgetEspeces: 18000,
    budgetVirement: 245000,
    daysOffsetStart: -45,
    daysOffsetEnd: 120,
  },
  {
    nom: "[DEMO] Résidence Les Tilleuls",
    adresse: "8 rue Lafayette, 64100 Bayonne",
    description:
      "Rénovation lourde immeuble R+3, 6 logements. Réfection plomberie, électricité, isolation.",
    statut: "EN_COURS",
    budgetEspeces: 12000,
    budgetVirement: 180000,
    daysOffsetStart: -30,
    daysOffsetEnd: 90,
  },
  {
    nom: "[DEMO] Chalet Pyrénées",
    adresse: "Route de la Pierre Saint-Martin, 64570 Arette",
    description:
      "Chalet montagne 220 m², charpente traditionnelle, isolation laine de bois, poêle à bois.",
    statut: "PAUSE",
    budgetEspeces: 8000,
    budgetVirement: 195000,
    daysOffsetStart: -60,
    daysOffsetEnd: 60,
  },
  {
    nom: "[DEMO] Bureau Alphatek HQ",
    adresse: "Zone Tertia, 64600 Anglet",
    description:
      "Aménagement de bureaux 320 m², open space + 4 salles de réunion, faux plafonds, cloisons.",
    statut: "PLANIFIE",
    budgetEspeces: 5000,
    budgetVirement: 95000,
    daysOffsetStart: 15,
    daysOffsetEnd: 75,
  },
  {
    nom: "[DEMO] Garage Soulé",
    adresse: "Route de Pau, 64320 Idron",
    description: "Construction garage double + atelier 90 m², dalle béton armé, charpente métallique.",
    statut: "EN_COURS",
    budgetEspeces: 4500,
    budgetVirement: 48000,
    daysOffsetStart: -10,
    daysOffsetEnd: 45,
  },
  {
    nom: "[DEMO] Réhabilitation Maison Lasserre",
    adresse: "5 rue Saint-Esprit, 64200 Biarritz",
    description: "Rénovation maison de ville 140 m², ravalement façade, mise aux normes électrique.",
    statut: "TERMINE",
    budgetEspeces: 6000,
    budgetVirement: 72000,
    daysOffsetStart: -120,
    daysOffsetEnd: -10,
  },
];

const EQUIPES_NOMS = [
  "Maçonnerie",
  "Charpente",
  "Plomberie",
  "Électricité",
  "Cloisons / Plâtrerie",
  "Carrelage",
  "Peinture",
  "Couverture",
];

const MATERIEL_DEMO = [
  { nomCommun: "Bétonnière 200L", marque: "Altrad", modele: "TX 230", possesseur: "ENTREPRISE", prixAchat: 1200 },
  { nomCommun: "Perforateur SDS-Max", marque: "Hilti", modele: "TE 70", possesseur: "ENTREPRISE", prixAchat: 1800 },
  { nomCommun: "Visseuse 18V", marque: "Makita", modele: "DHP485", possesseur: "ENTREPRISE", prixAchat: 320 },
  { nomCommun: "Meuleuse 230mm", marque: "Bosch", modele: "GWS 22-230", possesseur: "ENTREPRISE", prixAchat: 280 },
  { nomCommun: "Échafaudage 6m", marque: "Layher", modele: "Speedy", possesseur: "ENTREPRISE", prixAchat: 4500 },
  { nomCommun: "Niveau laser", marque: "Bosch", modele: "GLL 3-80", possesseur: "ENTREPRISE", prixAchat: 480 },
  { nomCommun: "Marteau-piqueur", marque: "Hilti", modele: "TE 1000-AVR", possesseur: "ENTREPRISE", prixAchat: 2400 },
  { nomCommun: "Compresseur 100L", marque: "Mecafer", modele: "Métal 100L", possesseur: "ENTREPRISE", prixAchat: 650 },
  { nomCommun: "Scie circulaire", marque: "Festool", modele: "TS 55 FEBQ", possesseur: "ENTREPRISE", prixAchat: 720 },
  { nomCommun: "Poste à souder MIG", marque: "GYS", modele: "Smartmig 162", possesseur: "ENTREPRISE", prixAchat: 540 },
  { nomCommun: "Caisse à outils complète", marque: "Stanley", modele: "FatMax", possesseur: "ENTREPRISE", prixAchat: 380 },
  { nomCommun: "Aspirateur de chantier", marque: "Karcher", modele: "WD 6", possesseur: "ENTREPRISE", prixAchat: 230 },
];

const FOURNISSEURS = [
  "Point P",
  "Leroy Merlin Pro",
  "Bigmat",
  "Tout Faire Matériaux",
  "Lafarge",
  "Saint-Gobain Distribution",
  "Sodimac",
];

const COMMANDES_DESIGNATIONS = [
  { d: "Sacs ciment Lafarge 35kg", q: () => randomInt(20, 60), pu: 8.9 },
  { d: "Parpaings 20cm (palette)", q: () => randomInt(1, 4), pu: 280 },
  { d: "Fer à béton HA 12mm (barre 6m)", q: () => randomInt(20, 80), pu: 9.2 },
  { d: "Plaques de plâtre BA13 (paquet 70)", q: () => randomInt(2, 6), pu: 240 },
  { d: "Carrelage grès cérame 60x60 (m²)", q: () => randomInt(15, 60), pu: 28 },
  { d: "Peinture acrylique blanc mat 15L", q: () => randomInt(2, 8), pu: 65 },
  { d: "Câble électrique 3G2.5 (rouleau 100m)", q: () => randomInt(1, 4), pu: 95 },
  { d: "Tube cuivre Ø 22 (barre 5m)", q: () => randomInt(4, 16), pu: 32 },
  { d: "Isolant laine de roche 100mm (m²)", q: () => randomInt(20, 80), pu: 14 },
];

const NOTES_TERRAIN = [
  "Coulage de la dalle terminé, on attendra 24h pour décoffrer.",
  "Équipe complète sur place, ambiance bonne.",
  "Petit retard ce matin, livraison fournisseur reportée à 14h.",
  "Météo correcte, on a pu avancer sur la charpente.",
  "Nous avons monté 3 cloisons de l'étage, prêt pour les passages électriques.",
  "Les fers à béton sont arrivés, on a démarré le ferraillage des poteaux.",
  "Test étanchéité OK, on peut continuer sur la couverture.",
  "L'équipe peinture a fini la sous-couche, demain attaque les couleurs.",
];

const INCIDENT_TITRES = [
  { titre: "Camion ciment en panne", cat: "MATERIEL_MANQUANT", grav: "URGENT" },
  { titre: "Pluie depuis 2h, coulage reporté", cat: "METEO", grav: "ATTENTION" },
  { titre: "Compresseur HS, à remplacer rapidement", cat: "PANNE", grav: "URGENT" },
  { titre: "Livraison BA13 reportée à demain", cat: "RETARD_FOURNISSEUR", grav: "ATTENTION" },
  { titre: "Petit accroc, ouvrier soigné sur place", cat: "ACCIDENT", grav: "INFO" },
  { titre: "Stock peinture insuffisant", cat: "MATERIEL_MANQUANT", grav: "ATTENTION" },
];

const DEMANDES_DESCRIPTIONS = [
  { d: "20 sacs ciment Lafarge 35kg", q: 20, u: "sacs", urg: "URGENT" },
  { d: "Tube PER 16mm pour planchers chauffants", q: 60, u: "ml", urg: "ATTENTION" },
  { d: "Pots de peinture acrylique blanc 5L", q: 8, u: "pots", urg: "INFO" },
  { d: "Plaques de plâtre BA13 supplémentaires", q: 30, u: "plaques", urg: "ATTENTION" },
  { d: "Câble électrique 3G2.5 - 100m", q: 1, u: "rouleau", urg: "URGENT" },
];

// ---------- Seed function ----------

async function seed() {
  console.log("🌱 Seed démo — démarrage…");

  // Vérifie qu'on n'a pas déjà des données démo
  const existingDemo = await db.chantier.count({
    where: { nom: { startsWith: "[DEMO]" } },
  });
  if (existingDemo > 0) {
    console.log(
      `⚠️  ${existingDemo} chantiers [DEMO] existent déjà. Skip.\n` +
        `Pour rejouer : supprime-les d'abord avec\n` +
        `   DELETE FROM "Chantier" WHERE nom LIKE '[DEMO]%';`
    );
    return;
  }

  // Récupère les ouvriers existants (on va les répartir dans les équipes)
  const existingOuvriers = await db.ouvrier.findMany({
    where: { actif: true },
    select: { id: true, nom: true, prenom: true },
  });
  if (existingOuvriers.length === 0) {
    console.log("⚠️  Aucun ouvrier actif dans la base. Continue sans pointages.");
  }

  // Récupère un admin (chef de chantier sera lui)
  const admin = await db.user.findFirst({
    where: { role: "ADMIN", status: "ACTIVE" },
  });
  if (!admin) {
    throw new Error(
      "Aucun admin trouvé. Crée d'abord un compte admin via /register puis approuve-le."
    );
  }

  // ---- 1. Crée les chantiers ----
  const chantiers = [];
  for (const cd of CHANTIERS_DEMO) {
    const c = await db.chantier.create({
      data: {
        nom: cd.nom,
        adresse: cd.adresse,
        description: cd.description,
        statut: cd.statut,
        budgetEspeces: cd.budgetEspeces,
        budgetVirement: cd.budgetVirement,
        dateDebut: daysAgo(-cd.daysOffsetStart),
        dateFin: daysAgo(-cd.daysOffsetEnd),
        chefId: admin.id,
      },
    });
    chantiers.push(c);
    console.log(`  ✓ Chantier ${c.nom}`);
  }

  // ---- 2. Crée les équipes (2-3 par chantier actif) ----
  const equipes = [];
  for (const c of chantiers) {
    const nbEquipes = c.statut === "EN_COURS" ? 3 : c.statut === "PAUSE" ? 2 : 1;
    for (let i = 0; i < nbEquipes; i++) {
      const nomBase = rand(EQUIPES_NOMS);
      const e = await db.equipe.create({
        data: {
          nom: `${nomBase} ${c.nom.replace("[DEMO] ", "").split(" ")[0]}`,
          chantierId: c.id,
        },
      });
      equipes.push(e);
    }
  }
  console.log(`  ✓ ${equipes.length} équipes`);

  // ---- 3. Affecte les ouvriers existants aux équipes ----
  if (existingOuvriers.length > 0 && equipes.length > 0) {
    let idx = 0;
    for (const ouv of existingOuvriers) {
      // Affecte chaque ouvrier à une équipe (round-robin)
      const targetEquipe = equipes[idx % equipes.length];
      await db.ouvrier.update({
        where: { id: ouv.id },
        data: { equipeId: targetEquipe.id },
      });
      idx++;
    }
    console.log(`  ✓ ${existingOuvriers.length} ouvriers répartis dans les équipes`);
  }

  // ---- 4. Matériel ----
  const materielsCreated = [];
  for (const m of MATERIEL_DEMO) {
    const mat = await db.materiel.create({
      data: {
        nomCommun: m.nomCommun,
        marque: m.marque,
        modele: m.modele,
        possesseur: m.possesseur,
        prixAchat: m.prixAchat,
        statut: "DISPO",
      },
    });
    materielsCreated.push(mat);
  }
  console.log(`  ✓ ${materielsCreated.length} matériels`);

  // ---- 5. Sorties matériel : pour les chantiers EN_COURS ----
  const chantiersActifs = chantiers.filter((c) => c.statut === "EN_COURS");
  let nbSorties = 0;
  for (const c of chantiersActifs) {
    const equipesChantier = equipes.filter((e) => e.chantierId === c.id);
    if (equipesChantier.length === 0) continue;
    // Chaque chantier actif sort 2-3 matériels
    const nbToSortir = randomInt(2, 4);
    for (let i = 0; i < nbToSortir; i++) {
      const mat = rand(materielsCreated);
      // Skip si déjà sorti
      if (mat.statut !== "DISPO") continue;
      await db.sortieMateriel.create({
        data: {
          materielId: mat.id,
          equipeId: rand(equipesChantier).id,
          chantierId: c.id,
          dateSortie: daysAgo(randomInt(1, 20)),
        },
      });
      await db.materiel.update({
        where: { id: mat.id },
        data: { statut: "SORTI" },
      });
      nbSorties++;
    }
  }
  console.log(`  ✓ ${nbSorties} sorties matériel`);

  // ---- 6. Commandes : 2-3 par chantier actif ----
  let nbCommandes = 0;
  for (const c of chantiersActifs) {
    const nbCmd = randomInt(2, 4);
    for (let i = 0; i < nbCmd; i++) {
      const nbLignes = randomInt(1, 3);
      const lignes = [];
      let total = 0;
      for (let j = 0; j < nbLignes; j++) {
        const def = rand(COMMANDES_DESIGNATIONS);
        const quantite = def.q();
        const prixUnitaire = def.pu;
        lignes.push({
          designation: def.d,
          quantite,
          prixUnitaire,
          total: quantite * prixUnitaire,
        });
        total += quantite * prixUnitaire;
      }
      await db.commande.create({
        data: {
          chantierId: c.id,
          fournisseur: rand(FOURNISSEURS),
          dateCommande: daysAgo(randomInt(1, 25)),
          dateLivraisonPrevue: daysAgo(randomInt(-5, 5)),
          statut: rand(["COMMANDEE", "EN_LIVRAISON", "LIVREE"]),
          mode: rand(["VIREMENT", "ESPECES"]),
          coutTotal: total,
          lignes: { create: lignes },
        },
      });
      nbCommandes++;
    }
  }
  console.log(`  ✓ ${nbCommandes} commandes`);

  // ---- 7. Locations : 1 par chantier actif ----
  let nbLocations = 0;
  for (const c of chantiersActifs) {
    const coutJour = randomInt(50, 200);
    const dureeJ = randomInt(3, 10);
    const dateDebut = daysAgo(randomInt(2, 8));
    const dateFinPrev = new Date(dateDebut);
    dateFinPrev.setDate(dateFinPrev.getDate() + dureeJ);
    await db.locationPret.create({
      data: {
        designation: rand([
          "Mini-pelle 1.5T",
          "Échafaudage roulant",
          "Nacelle 12m",
          "Compacteur plaque",
        ]),
        type: "LOCATION",
        fournisseurNom: rand(["Loxam", "Kiloutou", "Hertz Equipment"]),
        dateDebut,
        dateFinPrevue: dateFinPrev,
        coutJour,
        coutTotal: coutJour * dureeJ,
        chantierId: c.id,
      },
    });
    nbLocations++;
  }
  console.log(`  ✓ ${nbLocations} locations`);

  // ---- 8. Pointages : 5-10 jours sur chaque chantier actif ----
  let nbPointages = 0;
  if (existingOuvriers.length > 0) {
    for (const c of chantiersActifs) {
      const ouvriersDuChantier = existingOuvriers.filter(() => Math.random() < 0.6);
      const nbJours = randomInt(8, 15);
      for (let dayOffset = 1; dayOffset <= nbJours; dayOffset++) {
        const date = dayUtc(daysAgo(dayOffset));
        // Skip weekends
        const dow = date.getUTCDay();
        if (dow === 0 || dow === 6) continue;
        for (const ouv of ouvriersDuChantier) {
          if (Math.random() < 0.85) {
            // 85% de chance de pointer
            try {
              await db.pointage.create({
                data: {
                  ouvrierId: ouv.id,
                  date,
                  joursTravailles: rand([0.5, 1, 1]),
                  chantierId: c.id,
                },
              });
              nbPointages++;
            } catch {
              // Skip si conflit unique (déjà pointé)
            }
          }
        }
      }
    }
  }
  console.log(`  ✓ ${nbPointages} pointages`);

  // ---- 9. Incidents : 2-3 par chantier actif ----
  let nbIncidents = 0;
  for (const c of chantiersActifs) {
    const nbInc = randomInt(2, 3);
    for (let i = 0; i < nbInc; i++) {
      const def = rand(INCIDENT_TITRES);
      const isResolved = Math.random() < 0.5;
      await db.incident.create({
        data: {
          chantierId: c.id,
          reporterId: admin.id,
          titre: def.titre,
          description: `Incident sur le chantier ${c.nom.replace("[DEMO] ", "")}. ${def.titre}. Détails complets dans le journal.`,
          categorie: def.cat,
          gravite: def.grav,
          statut: isResolved ? "RESOLU" : rand(["OUVERT", "EN_COURS"]),
          resolutionNote: isResolved ? "Réglé sur place, équipe a pu reprendre." : null,
          resolvedAt: isResolved ? daysAgo(randomInt(1, 5)) : null,
          resolverId: isResolved ? admin.id : null,
          createdAt: daysAgo(randomInt(2, 15)),
          updatedAt: daysAgo(randomInt(0, 10)),
        },
      });
      nbIncidents++;
    }
  }
  console.log(`  ✓ ${nbIncidents} incidents`);

  // ---- 10. Demandes de matériel : 2 par chantier actif ----
  let nbDemandes = 0;
  for (const c of chantiersActifs) {
    for (let i = 0; i < 2; i++) {
      const def = rand(DEMANDES_DESCRIPTIONS);
      const statut = rand(["DEMANDEE", "APPROUVEE", "COMMANDEE", "REFUSEE"]);
      await db.demandeMateriel.create({
        data: {
          chantierId: c.id,
          requesterId: admin.id,
          description: def.d,
          quantite: def.q,
          unite: def.u,
          urgence: def.urg,
          fournisseur: rand(FOURNISSEURS),
          statut,
          reponseNote:
            statut !== "DEMANDEE"
              ? statut === "REFUSEE"
                ? "Stock disponible au dépôt, viens chercher."
                : "OK, je passe la commande."
              : null,
          approverId: statut !== "DEMANDEE" ? admin.id : null,
          approuveLe: statut !== "DEMANDEE" ? daysAgo(randomInt(0, 5)) : null,
          createdAt: daysAgo(randomInt(1, 12)),
          updatedAt: daysAgo(randomInt(0, 8)),
        },
      });
      nbDemandes++;
    }
  }
  console.log(`  ✓ ${nbDemandes} demandes de matériel`);

  // ---- 11. Journal : 4-8 messages par chantier actif sur les 7 derniers jours ----
  let nbMessages = 0;
  for (const c of chantiersActifs) {
    const nbDays = randomInt(3, 7);
    for (let dayOff = 0; dayOff < nbDays; dayOff++) {
      const baseDate = daysAgo(dayOff);
      const dayDate = dayUtc(baseDate);
      const nbMsgs = randomInt(2, 5);
      for (let i = 0; i < nbMsgs; i++) {
        const note = rand(NOTES_TERRAIN);
        const created = new Date(baseDate);
        created.setHours(randomInt(7, 18), randomInt(0, 59), 0, 0);
        await db.journalMessage.create({
          data: {
            chantierId: c.id,
            authorId: admin.id,
            date: dayDate,
            type: "NOTE",
            texte: note,
            createdAt: created,
            updatedAt: created,
          },
        });
        nbMessages++;
      }
    }
  }
  console.log(`  ✓ ${nbMessages} messages de journal`);

  console.log("\n✅ Seed démo terminé.");
}

seed()
  .catch((e) => {
    console.error("❌ Erreur seed :", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
