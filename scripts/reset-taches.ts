/**
 * Reset planning : supprime toutes les tâches + sections + labels et
 * recrée un petit set de démo cohérent avec les nouveautés
 * (priorités P1-P4, sous-tâches, sections, durées multi-jours).
 *
 * Usage : npx tsx scripts/reset-taches.ts
 *
 * Préserve les chantiers, équipes, commandes, locations, etc.
 * Uniquement les tâches / sections / labels sont reset.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";

config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set in .env");

const adapter = new (PrismaPg as any)({ connectionString });
const db = new (PrismaClient as any)({ adapter });

function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function main() {
  // 1. Wipe (cascade : TacheLabel partira tout seul via Tache->cascade)
  const t = await db.tache.deleteMany({});
  console.log(`✓ ${t.count} tâche(s) supprimée(s)`);

  const s = await db.section.deleteMany({});
  console.log(`✓ ${s.count} section(s) supprimée(s)`);

  // Labels : on garde s'ils existent, on en crée quelques-uns canoniques
  const existingLabels = await db.label.count();
  if (existingLabels === 0) {
    await db.label.createMany({
      data: [
        { nom: "Urgent", couleur: "#ef4444" },
        { nom: "Sécurité", couleur: "#f59e0b" },
        { nom: "Livraison", couleur: "#3b82f6" },
        { nom: "Client", couleur: "#10b981" },
      ],
    });
    console.log("✓ 4 labels canoniques créés");
  } else {
    console.log(`(${existingLabels} labels conservés)`);
  }

  // 2. Prend les 2 premiers chantiers non archivés en cours / planifiés
  const chantiers = await db.chantier.findMany({
    where: {
      archivedAt: null,
      statut: { in: ["PLANIFIE", "EN_COURS", "PAUSE"] },
    },
    select: { id: true, nom: true, equipes: { select: { id: true } } },
    orderBy: { createdAt: "asc" },
    take: 2,
  });

  if (chantiers.length === 0) {
    console.log("⚠ Aucun chantier actif — pas de démo créée");
    await db.$disconnect();
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Récupère les labels pour les associer
  const urgentLabel = await db.label.findFirst({
    where: { nom: { equals: "Urgent", mode: "insensitive" } },
  });
  const secuLabel = await db.label.findFirst({
    where: { nom: { equals: "Sécurité", mode: "insensitive" } },
  });

  for (const c of chantiers) {
    console.log(`\n→ ${c.nom}`);
    const equipeId = c.equipes[0]?.id ?? null;

    // 2 sections
    const sGros = await db.section.create({
      data: { chantierId: c.id, nom: "Gros œuvre", ordre: 0 },
    });
    const sFinit = await db.section.create({
      data: { chantierId: c.id, nom: "Finitions", ordre: 1 },
    });

    // Tâche parent + 2 sous-tâches
    const parent1 = await db.tache.create({
      data: {
        chantierId: c.id,
        sectionId: sGros.id,
        equipeId,
        nom: "Terrassement et fondations",
        description: "Préparation du terrain et coulage des fondations.",
        priorite: 1,
        dateDebut: addDays(today, 0),
        dateFin: addDays(today, 7),
        avancement: 60,
        statut: "EN_COURS",
        labels: urgentLabel
          ? { create: [{ labelId: urgentLabel.id }] }
          : undefined,
      },
    });

    await db.tache.create({
      data: {
        chantierId: c.id,
        sectionId: sGros.id,
        parentId: parent1.id,
        nom: "Tracer les fondations",
        priorite: 2,
        dateDebut: addDays(today, 0),
        dateFin: addDays(today, 2),
        avancement: 100,
        statut: "TERMINEE",
      },
    });
    await db.tache.create({
      data: {
        chantierId: c.id,
        sectionId: sGros.id,
        parentId: parent1.id,
        nom: "Couler le béton de propreté",
        priorite: 2,
        dateDebut: addDays(today, 3),
        dateFin: addDays(today, 5),
        avancement: 80,
        statut: "EN_COURS",
      },
    });

    // Tâche en retard (date limite passée)
    await db.tache.create({
      data: {
        chantierId: c.id,
        sectionId: sGros.id,
        nom: "Pose charpente bois",
        description: "Livraison reportée. À débloquer.",
        priorite: 1,
        dateDebut: addDays(today, -2),
        dateFin: addDays(today, 4),
        statut: "BLOQUEE",
        labels: secuLabel
          ? { create: [{ labelId: secuLabel.id }] }
          : undefined,
      },
    });

    // Tâche planifiée multi-jours
    await db.tache.create({
      data: {
        chantierId: c.id,
        sectionId: sFinit.id,
        equipeId,
        nom: "Préparation et application peinture",
        priorite: 3,
        dateDebut: addDays(today, 10),
        dateFin: addDays(today, 16),
        statut: "A_FAIRE",
      },
    });

    // Tâche sans section (un événement type "réunion")
    await db.tache.create({
      data: {
        chantierId: c.id,
        nom: "Réunion de chantier hebdomadaire",
        priorite: 4,
        dateDebut: addDays(today, 2),
        dateFin: addDays(today, 2),
        statut: "A_FAIRE",
      },
    });

    console.log("  ✓ 2 sections, 1 tâche parent + 2 sous-tâches, 3 autres");
  }

  console.log("\n✓ Reset planning terminé");
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
