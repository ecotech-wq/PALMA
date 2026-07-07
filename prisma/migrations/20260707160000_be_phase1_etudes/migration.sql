-- BE phase 1 : projets typés (étude), phases d'honoraires, temps passés.
-- Une étude EST un Chantier de type ETUDE (VISION-LYNX-V4, « projets typés ») :
-- elle hérite messagerie, canaux, membres, tâches, plans sans nouvelle entité.
-- SQL idempotent : rejouable sans effet de bord (IF NOT EXISTS partout).

-- 1. Type de projet sur Chantier
DO $$ BEGIN
    CREATE TYPE "TypeProjet" AS ENUM ('CHANTIER', 'ETUDE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Chantier" ADD COLUMN IF NOT EXISTS "type" "TypeProjet" NOT NULL DEFAULT 'CHANTIER';
CREATE INDEX IF NOT EXISTS "Chantier_type_idx" ON "Chantier"("type");

-- 2. Phases d'honoraires d'une étude (ESQ, APS, APD, PRO, DCE, EXE, VISA, DET...)
CREATE TABLE IF NOT EXISTS "PhaseEtude" (
    "id" TEXT NOT NULL,
    "chantierId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "montantVendu" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "budgetHeures" DECIMAL(7,2),
    "dateDebut" TIMESTAMP(3),
    "dateFin" TIMESTAMP(3),
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PhaseEtude_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PhaseEtude_chantierId_ordre_idx" ON "PhaseEtude"("chantierId", "ordre");

DO $$ BEGIN
    ALTER TABLE "PhaseEtude" ADD CONSTRAINT "PhaseEtude_chantierId_fkey"
        FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Temps passés (la matière première du pilotage BE)
CREATE TABLE IF NOT EXISTS "TempsPasse" (
    "id" TEXT NOT NULL,
    "chantierId" TEXT NOT NULL,
    "phaseId" TEXT,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "heures" DECIMAL(4,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TempsPasse_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TempsPasse_userId_date_idx" ON "TempsPasse"("userId", "date");
CREATE INDEX IF NOT EXISTS "TempsPasse_chantierId_date_idx" ON "TempsPasse"("chantierId", "date");

DO $$ BEGIN
    ALTER TABLE "TempsPasse" ADD CONSTRAINT "TempsPasse_chantierId_fkey"
        FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "TempsPasse" ADD CONSTRAINT "TempsPasse_phaseId_fkey"
        FOREIGN KEY ("phaseId") REFERENCES "PhaseEtude"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "TempsPasse" ADD CONSTRAINT "TempsPasse_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
