-- CRM Affaires (2026-07-17) : pipeline commercial par typologie, canal de
-- messagerie par affaire, taches liees, palier de relance dormante.
-- SQL additif idempotent.

DO $$ BEGIN CREATE TYPE "TypologieAffaire" AS ENUM ('PERMIS_CONSTRUIRE','ETUDE_STRUCTURE','TRAVAUX','LABO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "StatutAffaire" AS ENUM ('EN_COURS','GAGNEE','PERDUE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TYPE "PalierRelance" ADD VALUE IF NOT EXISTS 'AFFAIRE_DORMANTE';
ALTER TYPE "TypeObjetRelance" ADD VALUE IF NOT EXISTS 'AFFAIRE';

CREATE TABLE IF NOT EXISTS "Affaire" (
    "id" TEXT NOT NULL,
    "espaceId" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "typologie" "TypologieAffaire" NOT NULL,
    "etapeCle" TEXT NOT NULL,
    "etapeDepuis" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statut" "StatutAffaire" NOT NULL DEFAULT 'EN_COURS',
    "motifPerte" TEXT,
    "contactNom" TEXT NOT NULL,
    "contactTel" TEXT,
    "contactEmail" TEXT,
    "adresse" TEXT,
    "description" TEXT,
    "valeurEstimee" DECIMAL(12,2),
    "prochaineAction" TEXT,
    "prochaineActionLe" DATE,
    "responsableId" TEXT,
    "checklist" JSONB NOT NULL DEFAULT '[]',
    "clientUserId" TEXT,
    "chantierId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "creePar" TEXT,
    CONSTRAINT "Affaire_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Affaire_espaceId_statut_idx" ON "Affaire"("espaceId", "statut");
CREATE INDEX IF NOT EXISTS "Affaire_typologie_etapeCle_idx" ON "Affaire"("typologie", "etapeCle");
CREATE INDEX IF NOT EXISTS "Affaire_responsableId_idx" ON "Affaire"("responsableId");
CREATE INDEX IF NOT EXISTS "Affaire_prochaineActionLe_idx" ON "Affaire"("prochaineActionLe");
DO $$ BEGIN ALTER TABLE "Affaire" ADD CONSTRAINT "Affaire_espaceId_fkey" FOREIGN KEY ("espaceId") REFERENCES "Espace"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Affaire" ADD CONSTRAINT "Affaire_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Affaire" ADD CONSTRAINT "Affaire_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Affaire" ADD CONSTRAINT "Affaire_chantierId_fkey" FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Canal" ALTER COLUMN "chantierId" DROP NOT NULL;
ALTER TABLE "Canal" ADD COLUMN IF NOT EXISTS "affaireId" TEXT;
DO $$ BEGIN ALTER TABLE "Canal" ADD CONSTRAINT "Canal_affaireId_fkey" FOREIGN KEY ("affaireId") REFERENCES "Affaire"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "Canal_affaireId_idx" ON "Canal"("affaireId");

ALTER TABLE "JournalMessage" ALTER COLUMN "chantierId" DROP NOT NULL;

ALTER TABLE "Tache" ADD COLUMN IF NOT EXISTS "affaireId" TEXT;
DO $$ BEGIN ALTER TABLE "Tache" ADD CONSTRAINT "Tache_affaireId_fkey" FOREIGN KEY ("affaireId") REFERENCES "Affaire"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "Tache_affaireId_idx" ON "Tache"("affaireId");
