-- Moteur de relances financieres (2026-07-13) : type de notification dedie
-- + journal d'idempotence (un objet notifie une seule fois par palier).
-- SQL additif idempotent.

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'RELANCE';

DO $$ BEGIN CREATE TYPE "TypeObjetRelance" AS ENUM ('FACTURE','DEVIS','SITUATION','RETENUE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PalierRelance" AS ENUM ('PREAVIS_ECHEANCE','RELANCE_1','RELANCE_2','RELANCE_3','MISE_EN_DEMEURE','DEVIS_SANS_REPONSE','SITUATION_A_FACTURER','RETENUE_LIBERABLE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "RelanceLog" (
    "id" TEXT NOT NULL,
    "espaceId" TEXT NOT NULL,
    "chantierId" TEXT,
    "objetType" "TypeObjetRelance" NOT NULL,
    "objetId" TEXT NOT NULL,
    "palier" "PalierRelance" NOT NULL,
    "resume" TEXT NOT NULL,
    "envoyeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RelanceLog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RelanceLog_objetType_objetId_palier_key" ON "RelanceLog"("objetType", "objetId", "palier");
CREATE INDEX IF NOT EXISTS "RelanceLog_espaceId_envoyeLe_idx" ON "RelanceLog"("espaceId", "envoyeLe");
