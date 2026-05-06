-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'CHEF');

-- CreateEnum
CREATE TYPE "StatutChantier" AS ENUM ('PLANIFIE', 'EN_COURS', 'PAUSE', 'TERMINE', 'ANNULE');

-- CreateEnum
CREATE TYPE "TypeContrat" AS ENUM ('FIXE', 'JOUR', 'SEMAINE', 'MOIS', 'FORFAIT');

-- CreateEnum
CREATE TYPE "ModePaie" AS ENUM ('JOUR', 'SEMAINE', 'MOIS');

-- CreateEnum
CREATE TYPE "ModePaiement" AS ENUM ('ESPECES', 'VIREMENT');

-- CreateEnum
CREATE TYPE "StatutPaiement" AS ENUM ('CALCULE', 'PAYE', 'ANNULE');

-- CreateEnum
CREATE TYPE "StatutMateriel" AS ENUM ('DISPO', 'SORTI', 'EN_LOCATION', 'HS', 'PERDU');

-- CreateEnum
CREATE TYPE "PossesseurMateriel" AS ENUM ('ENTREPRISE', 'LOCATION', 'PRET');

-- CreateEnum
CREATE TYPE "EtatRetour" AS ENUM ('BON', 'USE', 'CASSE', 'MANQUANT');

-- CreateEnum
CREATE TYPE "TypeLocationPret" AS ENUM ('LOCATION', 'PRET');

-- CreateEnum
CREATE TYPE "StatutCommande" AS ENUM ('COMMANDEE', 'EN_LIVRAISON', 'LIVREE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "StatutTache" AS ENUM ('A_FAIRE', 'EN_COURS', 'TERMINEE', 'BLOQUEE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CHEF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chantier" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "adresse" TEXT,
    "description" TEXT,
    "dateDebut" TIMESTAMP(3),
    "dateFin" TIMESTAMP(3),
    "statut" "StatutChantier" NOT NULL DEFAULT 'PLANIFIE',
    "budgetEspeces" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "budgetVirement" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "chefId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chantier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipe" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "chantierId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ouvrier" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT,
    "telephone" TEXT,
    "photo" TEXT,
    "typeContrat" "TypeContrat" NOT NULL,
    "tarifBase" DECIMAL(10,2) NOT NULL,
    "modePaie" "ModePaie" NOT NULL DEFAULT 'MOIS',
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "equipeId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ouvrier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pointage" (
    "id" TEXT NOT NULL,
    "ouvrierId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "joursTravailles" DECIMAL(4,2) NOT NULL DEFAULT 1,
    "chantierId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pointage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Avance" (
    "id" TEXT NOT NULL,
    "ouvrierId" TEXT NOT NULL,
    "montant" DECIMAL(10,2) NOT NULL,
    "date" DATE NOT NULL,
    "mode" "ModePaiement" NOT NULL DEFAULT 'ESPECES',
    "reglee" BOOLEAN NOT NULL DEFAULT false,
    "paiementId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Avance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Paiement" (
    "id" TEXT NOT NULL,
    "ouvrierId" TEXT NOT NULL,
    "periodeDebut" DATE NOT NULL,
    "periodeFin" DATE NOT NULL,
    "joursTravailles" DECIMAL(6,2) NOT NULL,
    "montantBrut" DECIMAL(10,2) NOT NULL,
    "avancesDeduites" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "retenueOutil" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "montantNet" DECIMAL(10,2) NOT NULL,
    "mode" "ModePaiement" NOT NULL DEFAULT 'ESPECES',
    "date" DATE NOT NULL,
    "statut" "StatutPaiement" NOT NULL DEFAULT 'CALCULE',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Paiement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutilPersonnel" (
    "id" TEXT NOT NULL,
    "ouvrierId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prixTotal" DECIMAL(10,2) NOT NULL,
    "mensualite" DECIMAL(10,2) NOT NULL,
    "restantDu" DECIMAL(10,2) NOT NULL,
    "dateAchat" DATE NOT NULL,
    "solde" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutilPersonnel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetenueOutil" (
    "id" TEXT NOT NULL,
    "outilPersonnelId" TEXT NOT NULL,
    "paiementId" TEXT NOT NULL,
    "montant" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetenueOutil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Materiel" (
    "id" TEXT NOT NULL,
    "nomCommun" TEXT NOT NULL,
    "marque" TEXT,
    "modele" TEXT,
    "numeroSerie" TEXT,
    "photo" TEXT,
    "statut" "StatutMateriel" NOT NULL DEFAULT 'DISPO',
    "possesseur" "PossesseurMateriel" NOT NULL DEFAULT 'ENTREPRISE',
    "prixAchat" DECIMAL(10,2),
    "dateAchat" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Materiel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Accessoire" (
    "id" TEXT NOT NULL,
    "materielId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Accessoire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SortieMateriel" (
    "id" TEXT NOT NULL,
    "materielId" TEXT NOT NULL,
    "equipeId" TEXT,
    "chantierId" TEXT,
    "dateSortie" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateRetour" TIMESTAMP(3),
    "etatRetour" "EtatRetour",
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SortieMateriel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationPret" (
    "id" TEXT NOT NULL,
    "materielId" TEXT,
    "designation" TEXT NOT NULL,
    "type" "TypeLocationPret" NOT NULL,
    "fournisseurNom" TEXT NOT NULL,
    "chantierId" TEXT,
    "dateDebut" DATE NOT NULL,
    "dateFinPrevue" DATE NOT NULL,
    "dateRetourReel" DATE,
    "coutJour" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "coutTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cloture" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationPret_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commande" (
    "id" TEXT NOT NULL,
    "chantierId" TEXT NOT NULL,
    "fournisseur" TEXT NOT NULL,
    "reference" TEXT,
    "coutTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "dateCommande" DATE NOT NULL,
    "dateLivraisonPrevue" DATE,
    "dateLivraisonReelle" DATE,
    "statut" "StatutCommande" NOT NULL DEFAULT 'COMMANDEE',
    "mode" "ModePaiement" NOT NULL DEFAULT 'VIREMENT',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Commande_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LigneCommande" (
    "id" TEXT NOT NULL,
    "commandeId" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "quantite" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "prixUnitaire" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "LigneCommande_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tache" (
    "id" TEXT NOT NULL,
    "chantierId" TEXT NOT NULL,
    "equipeId" TEXT,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "dateDebut" DATE NOT NULL,
    "dateFin" DATE NOT NULL,
    "avancement" INTEGER NOT NULL DEFAULT 0,
    "statut" "StatutTache" NOT NULL DEFAULT 'A_FAIRE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_TacheDependance" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TacheDependance_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Pointage_date_idx" ON "Pointage"("date");

-- CreateIndex
CREATE INDEX "Pointage_chantierId_idx" ON "Pointage"("chantierId");

-- CreateIndex
CREATE UNIQUE INDEX "Pointage_ouvrierId_date_key" ON "Pointage"("ouvrierId", "date");

-- CreateIndex
CREATE INDEX "Avance_ouvrierId_idx" ON "Avance"("ouvrierId");

-- CreateIndex
CREATE INDEX "Avance_reglee_idx" ON "Avance"("reglee");

-- CreateIndex
CREATE INDEX "Paiement_ouvrierId_periodeDebut_idx" ON "Paiement"("ouvrierId", "periodeDebut");

-- CreateIndex
CREATE INDEX "OutilPersonnel_ouvrierId_solde_idx" ON "OutilPersonnel"("ouvrierId", "solde");

-- CreateIndex
CREATE INDEX "Materiel_statut_idx" ON "Materiel"("statut");

-- CreateIndex
CREATE INDEX "Materiel_possesseur_idx" ON "Materiel"("possesseur");

-- CreateIndex
CREATE INDEX "SortieMateriel_materielId_dateRetour_idx" ON "SortieMateriel"("materielId", "dateRetour");

-- CreateIndex
CREATE INDEX "SortieMateriel_equipeId_idx" ON "SortieMateriel"("equipeId");

-- CreateIndex
CREATE INDEX "LocationPret_cloture_dateFinPrevue_idx" ON "LocationPret"("cloture", "dateFinPrevue");

-- CreateIndex
CREATE INDEX "Commande_chantierId_idx" ON "Commande"("chantierId");

-- CreateIndex
CREATE INDEX "Commande_statut_idx" ON "Commande"("statut");

-- CreateIndex
CREATE INDEX "Tache_chantierId_idx" ON "Tache"("chantierId");

-- CreateIndex
CREATE INDEX "Tache_dateDebut_dateFin_idx" ON "Tache"("dateDebut", "dateFin");

-- CreateIndex
CREATE INDEX "_TacheDependance_B_index" ON "_TacheDependance"("B");

-- AddForeignKey
ALTER TABLE "Chantier" ADD CONSTRAINT "Chantier_chefId_fkey" FOREIGN KEY ("chefId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipe" ADD CONSTRAINT "Equipe_chantierId_fkey" FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ouvrier" ADD CONSTRAINT "Ouvrier_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "Equipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pointage" ADD CONSTRAINT "Pointage_ouvrierId_fkey" FOREIGN KEY ("ouvrierId") REFERENCES "Ouvrier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pointage" ADD CONSTRAINT "Pointage_chantierId_fkey" FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Avance" ADD CONSTRAINT "Avance_ouvrierId_fkey" FOREIGN KEY ("ouvrierId") REFERENCES "Ouvrier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Avance" ADD CONSTRAINT "Avance_paiementId_fkey" FOREIGN KEY ("paiementId") REFERENCES "Paiement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Paiement" ADD CONSTRAINT "Paiement_ouvrierId_fkey" FOREIGN KEY ("ouvrierId") REFERENCES "Ouvrier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutilPersonnel" ADD CONSTRAINT "OutilPersonnel_ouvrierId_fkey" FOREIGN KEY ("ouvrierId") REFERENCES "Ouvrier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetenueOutil" ADD CONSTRAINT "RetenueOutil_outilPersonnelId_fkey" FOREIGN KEY ("outilPersonnelId") REFERENCES "OutilPersonnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetenueOutil" ADD CONSTRAINT "RetenueOutil_paiementId_fkey" FOREIGN KEY ("paiementId") REFERENCES "Paiement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Accessoire" ADD CONSTRAINT "Accessoire_materielId_fkey" FOREIGN KEY ("materielId") REFERENCES "Materiel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SortieMateriel" ADD CONSTRAINT "SortieMateriel_materielId_fkey" FOREIGN KEY ("materielId") REFERENCES "Materiel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SortieMateriel" ADD CONSTRAINT "SortieMateriel_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "Equipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SortieMateriel" ADD CONSTRAINT "SortieMateriel_chantierId_fkey" FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationPret" ADD CONSTRAINT "LocationPret_materielId_fkey" FOREIGN KEY ("materielId") REFERENCES "Materiel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationPret" ADD CONSTRAINT "LocationPret_chantierId_fkey" FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commande" ADD CONSTRAINT "Commande_chantierId_fkey" FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LigneCommande" ADD CONSTRAINT "LigneCommande_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "Commande"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tache" ADD CONSTRAINT "Tache_chantierId_fkey" FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tache" ADD CONSTRAINT "Tache_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "Equipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TacheDependance" ADD CONSTRAINT "_TacheDependance_A_fkey" FOREIGN KEY ("A") REFERENCES "Tache"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TacheDependance" ADD CONSTRAINT "_TacheDependance_B_fkey" FOREIGN KEY ("B") REFERENCES "Tache"("id") ON DELETE CASCADE ON UPDATE CASCADE;
