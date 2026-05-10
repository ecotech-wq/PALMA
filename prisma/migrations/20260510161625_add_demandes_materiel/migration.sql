CREATE TYPE "StatutDemandeMateriel" AS ENUM (
  'DEMANDEE',
  'APPROUVEE',
  'REFUSEE',
  'COMMANDEE'
);

CREATE TABLE "DemandeMateriel" (
  "id" TEXT NOT NULL,
  "chantierId" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "quantite" DECIMAL(10, 2) NOT NULL DEFAULT 1,
  "unite" TEXT,
  "urgence" "NiveauGravite" NOT NULL DEFAULT 'ATTENTION',
  "fournisseur" TEXT,
  "statut" "StatutDemandeMateriel" NOT NULL DEFAULT 'DEMANDEE',
  "reponseNote" TEXT,
  "approverId" TEXT,
  "approuveLe" TIMESTAMP(3),
  "commandeId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DemandeMateriel_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DemandeMateriel_chantierId_idx" ON "DemandeMateriel"("chantierId");
CREATE INDEX "DemandeMateriel_statut_idx" ON "DemandeMateriel"("statut");
CREATE INDEX "DemandeMateriel_createdAt_idx" ON "DemandeMateriel"("createdAt" DESC);

ALTER TABLE "DemandeMateriel"
  ADD CONSTRAINT "DemandeMateriel_chantierId_fkey"
  FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE CASCADE;

ALTER TABLE "DemandeMateriel"
  ADD CONSTRAINT "DemandeMateriel_requesterId_fkey"
  FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT;

ALTER TABLE "DemandeMateriel"
  ADD CONSTRAINT "DemandeMateriel_approverId_fkey"
  FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL;
