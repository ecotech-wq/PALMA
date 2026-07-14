-- Module Laboratoire V1 (2026-07-14) : prelevements, eprouvettes, essais,
-- formulations R&D, equipements ; palier de relance ESSAI_ECHU.
-- SQL additif idempotent.

ALTER TYPE "PalierRelance" ADD VALUE IF NOT EXISTS 'ESSAI_ECHU';
ALTER TYPE "TypeObjetRelance" ADD VALUE IF NOT EXISTS 'ESSAI';
DO $$ BEGIN CREATE TYPE "StatutEssaiLabo" AS ENUM ('PLANIFIE','EN_COURS','VALIDE','ANNULE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "FormulationLabo" (
    "id" TEXT NOT NULL, "espaceId" TEXT NOT NULL, "nom" TEXT NOT NULL,
    "campagne" TEXT, "description" TEXT, "composition" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "creePar" TEXT,
    CONSTRAINT "FormulationLabo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FormulationLabo_espaceId_idx" ON "FormulationLabo"("espaceId");
DO $$ BEGIN ALTER TABLE "FormulationLabo" ADD CONSTRAINT "FormulationLabo_espaceId_fkey" FOREIGN KEY ("espaceId") REFERENCES "Espace"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "PrelevementLabo" (
    "id" TEXT NOT NULL, "espaceId" TEXT NOT NULL, "chantierId" TEXT, "formulationId" TEXT,
    "reference" TEXT NOT NULL, "materiau" TEXT NOT NULL, "origine" TEXT,
    "datePrelevement" DATE NOT NULL, "preleveur" TEXT, "classePrescrite" TEXT, "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "creePar" TEXT,
    CONSTRAINT "PrelevementLabo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PrelevementLabo_espaceId_idx" ON "PrelevementLabo"("espaceId");
CREATE INDEX IF NOT EXISTS "PrelevementLabo_chantierId_idx" ON "PrelevementLabo"("chantierId");
CREATE INDEX IF NOT EXISTS "PrelevementLabo_formulationId_idx" ON "PrelevementLabo"("formulationId");
DO $$ BEGIN ALTER TABLE "PrelevementLabo" ADD CONSTRAINT "PrelevementLabo_espaceId_fkey" FOREIGN KEY ("espaceId") REFERENCES "Espace"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "PrelevementLabo" ADD CONSTRAINT "PrelevementLabo_chantierId_fkey" FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "PrelevementLabo" ADD CONSTRAINT "PrelevementLabo_formulationId_fkey" FOREIGN KEY ("formulationId") REFERENCES "FormulationLabo"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "EprouvetteLabo" (
    "id" TEXT NOT NULL, "prelevementId" TEXT NOT NULL, "code" TEXT NOT NULL,
    "geometrie" TEXT, "dateFabrication" DATE, "conditionsCure" TEXT,
    CONSTRAINT "EprouvetteLabo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "EprouvetteLabo_code_key" ON "EprouvetteLabo"("code");
CREATE INDEX IF NOT EXISTS "EprouvetteLabo_prelevementId_idx" ON "EprouvetteLabo"("prelevementId");
DO $$ BEGIN ALTER TABLE "EprouvetteLabo" ADD CONSTRAINT "EprouvetteLabo_prelevementId_fkey" FOREIGN KEY ("prelevementId") REFERENCES "PrelevementLabo"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "EquipementLabo" (
    "id" TEXT NOT NULL, "espaceId" TEXT NOT NULL, "nom" TEXT NOT NULL,
    "dateEtalonnage" DATE, "note" TEXT,
    CONSTRAINT "EquipementLabo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "EquipementLabo_espaceId_idx" ON "EquipementLabo"("espaceId");
DO $$ BEGIN ALTER TABLE "EquipementLabo" ADD CONSTRAINT "EquipementLabo_espaceId_fkey" FOREIGN KEY ("espaceId") REFERENCES "Espace"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "EssaiLabo" (
    "id" TEXT NOT NULL, "prelevementId" TEXT NOT NULL, "eprouvetteId" TEXT, "equipementId" TEXT,
    "type" TEXT NOT NULL, "norme" TEXT, "protocole" TEXT, "echeance" DATE,
    "statut" "StatutEssaiLabo" NOT NULL DEFAULT 'PLANIFIE',
    "operateur" TEXT, "dateRealisation" DATE,
    "valeur" DECIMAL(12,4), "unite" TEXT, "incertitude" TEXT, "seuil" DECIMAL(12,4),
    "conforme" BOOLEAN, "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "creePar" TEXT,
    CONSTRAINT "EssaiLabo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "EssaiLabo_prelevementId_idx" ON "EssaiLabo"("prelevementId");
CREATE INDEX IF NOT EXISTS "EssaiLabo_echeance_idx" ON "EssaiLabo"("echeance");
CREATE INDEX IF NOT EXISTS "EssaiLabo_statut_idx" ON "EssaiLabo"("statut");
DO $$ BEGIN ALTER TABLE "EssaiLabo" ADD CONSTRAINT "EssaiLabo_prelevementId_fkey" FOREIGN KEY ("prelevementId") REFERENCES "PrelevementLabo"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "EssaiLabo" ADD CONSTRAINT "EssaiLabo_eprouvetteId_fkey" FOREIGN KEY ("eprouvetteId") REFERENCES "EprouvetteLabo"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "EssaiLabo" ADD CONSTRAINT "EssaiLabo_equipementId_fkey" FOREIGN KEY ("equipementId") REFERENCES "EquipementLabo"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
