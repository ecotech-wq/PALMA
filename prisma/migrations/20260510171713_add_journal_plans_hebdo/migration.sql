-- Journal de chantier (timeline chat-like)
CREATE TYPE "JournalMessageType" AS ENUM (
  'NOTE',
  'SYSTEM_INCIDENT',
  'SYSTEM_DEMANDE',
  'SYSTEM_COMMANDE',
  'SYSTEM_RAPPORT',
  'BILAN_JOURNEE'
);

CREATE TABLE "JournalMessage" (
  "id" TEXT NOT NULL,
  "chantierId" TEXT NOT NULL,
  "authorId" TEXT,
  "date" DATE NOT NULL,
  "type" "JournalMessageType" NOT NULL DEFAULT 'NOTE',
  "texte" TEXT,
  "photos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "videos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "incidentId" TEXT,
  "demandeId" TEXT,
  "commandeId" TEXT,
  "rapportId" TEXT,
  "hiddenFromClient" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "JournalMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JournalMessage_chantierId_date_idx" ON "JournalMessage"("chantierId", "date");
CREATE INDEX "JournalMessage_createdAt_idx" ON "JournalMessage"("createdAt" DESC);

ALTER TABLE "JournalMessage"
  ADD CONSTRAINT "JournalMessage_chantierId_fkey"
  FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE CASCADE;

ALTER TABLE "JournalMessage"
  ADD CONSTRAINT "JournalMessage_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL;

-- Plans de chantier (fichiers d'aide aux équipes)
CREATE TABLE "PlanChantier" (
  "id" TEXT NOT NULL,
  "chantierId" TEXT NOT NULL,
  "uploaderId" TEXT NOT NULL,
  "nom" TEXT NOT NULL,
  "description" TEXT,
  "fileUrl" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PlanChantier_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlanChantier_chantierId_idx" ON "PlanChantier"("chantierId");

ALTER TABLE "PlanChantier"
  ADD CONSTRAINT "PlanChantier_chantierId_fkey"
  FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE CASCADE;

ALTER TABLE "PlanChantier"
  ADD CONSTRAINT "PlanChantier_uploaderId_fkey"
  FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT;

-- Rapport hebdomadaire (curé par admin avant envoi client)
CREATE TABLE "RapportHebdo" (
  "id" TEXT NOT NULL,
  "chantierId" TEXT NOT NULL,
  "semaineDebut" DATE NOT NULL,
  "texteIntro" TEXT,
  "hiddenMessageIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "envoyeAuClient" BOOLEAN NOT NULL DEFAULT false,
  "envoyeLe" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RapportHebdo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RapportHebdo_chantierId_semaineDebut_key"
  ON "RapportHebdo"("chantierId", "semaineDebut");

ALTER TABLE "RapportHebdo"
  ADD CONSTRAINT "RapportHebdo_chantierId_fkey"
  FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE CASCADE;
