CREATE TYPE "CategorieIncident" AS ENUM (
  'MATERIEL_MANQUANT',
  'PANNE',
  'METEO',
  'RETARD_FOURNISSEUR',
  'SECURITE',
  'ACCIDENT',
  'CONFLIT',
  'AUTRE'
);

CREATE TYPE "NiveauGravite" AS ENUM (
  'INFO',
  'ATTENTION',
  'URGENT'
);

CREATE TYPE "StatutIncident" AS ENUM (
  'OUVERT',
  'EN_COURS',
  'RESOLU'
);

CREATE TABLE "Incident" (
  "id" TEXT NOT NULL,
  "chantierId" TEXT,
  "reporterId" TEXT NOT NULL,
  "titre" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "categorie" "CategorieIncident" NOT NULL,
  "gravite" "NiveauGravite" NOT NULL DEFAULT 'ATTENTION',
  "statut" "StatutIncident" NOT NULL DEFAULT 'OUVERT',
  "resolutionNote" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "resolverId" TEXT,
  "photos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Incident_chantierId_idx" ON "Incident"("chantierId");
CREATE INDEX "Incident_statut_idx" ON "Incident"("statut");
CREATE INDEX "Incident_createdAt_idx" ON "Incident"("createdAt" DESC);

ALTER TABLE "Incident"
  ADD CONSTRAINT "Incident_chantierId_fkey"
  FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE SET NULL;

ALTER TABLE "Incident"
  ADD CONSTRAINT "Incident_reporterId_fkey"
  FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT;

ALTER TABLE "Incident"
  ADD CONSTRAINT "Incident_resolverId_fkey"
  FOREIGN KEY ("resolverId") REFERENCES "User"("id") ON DELETE SET NULL;
