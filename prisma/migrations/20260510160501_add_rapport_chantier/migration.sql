-- Météo possible sur un rapport de chantier
CREATE TYPE "Meteo" AS ENUM (
  'SOLEIL',
  'NUAGEUX',
  'PLUIE',
  'ORAGE',
  'NEIGE',
  'GEL',
  'VENT_FORT'
);

-- Rapport journalier de chantier (DSR)
CREATE TABLE "RapportChantier" (
  "id" TEXT NOT NULL,
  "chantierId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "meteo" "Meteo",
  "texte" TEXT NOT NULL,
  "photos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "nbOuvriers" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RapportChantier_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RapportChantier_chantierId_date_idx"
  ON "RapportChantier"("chantierId", "date" DESC);
CREATE INDEX "RapportChantier_authorId_idx"
  ON "RapportChantier"("authorId");

ALTER TABLE "RapportChantier"
  ADD CONSTRAINT "RapportChantier_chantierId_fkey"
  FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE CASCADE;

ALTER TABLE "RapportChantier"
  ADD CONSTRAINT "RapportChantier_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT;
