-- Visibility flags par client (admin contrôle ce que le client voit)
ALTER TABLE "User"
  ADD COLUMN "showJournal" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "showIncidents" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "showPlans" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "showRapportsHebdo" BOOLEAN NOT NULL DEFAULT true;

-- Archivage doux d'un chantier (nullable pour compat)
ALTER TABLE "Chantier"
  ADD COLUMN "archivedAt" TIMESTAMP(3);

-- Signature client sur rapport hebdo
ALTER TABLE "RapportHebdo"
  ADD COLUMN "signatureClientUrl" TEXT,
  ADD COLUMN "signatureClientLe" TIMESTAMP(3),
  ADD COLUMN "signatureClientId" TEXT;

-- PV de réception
CREATE TYPE "StatutPvReception" AS ENUM (
  'BROUILLON',
  'ENVOYE_CLIENT',
  'SIGNE_CLIENT',
  'RESERVES_LEVEES'
);

CREATE TABLE "PvReception" (
  "id" TEXT NOT NULL,
  "chantierId" TEXT NOT NULL,
  "dateReception" DATE NOT NULL,
  "reserves" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "texteRecap" TEXT,
  "signatureAdminUrl" TEXT,
  "signatureAdminLe" TIMESTAMP(3),
  "signatureClientUrl" TEXT,
  "signatureClientLe" TIMESTAMP(3),
  "statut" "StatutPvReception" NOT NULL DEFAULT 'BROUILLON',
  "reservesLeveeUrl" TEXT,
  "reservesLeveeLe" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PvReception_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PvReception_chantierId_key" ON "PvReception"("chantierId");

ALTER TABLE "PvReception"
  ADD CONSTRAINT "PvReception_chantierId_fkey"
  FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE CASCADE;
