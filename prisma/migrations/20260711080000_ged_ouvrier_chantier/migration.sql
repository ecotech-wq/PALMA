-- GED ouvrier + GED chantier (2026-07-11) : documents des employés (CV,
-- habilitations...) et zone documentaire par chantier (plans, contrats,
-- devis) avec circuit de signature client. SQL additif idempotent.

DO $$ BEGIN CREATE TYPE "CategorieDocOuvrier" AS ENUM ('CV','HABILITATION','CONTRAT','IDENTITE','MEDICAL','AUTRE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CategorieDocChantier" AS ENUM ('PLAN','CONTRAT','DEVIS','FACTURE','PV','RAPPORT','AUTRE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "StatutSignatureDoc" AS ENUM ('SANS','A_SIGNER','SIGNE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "OuvrierDocument" (
    "id" TEXT NOT NULL,
    "ouvrierId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "categorie" "CategorieDocOuvrier" NOT NULL DEFAULT 'AUTRE',
    "fichier" TEXT NOT NULL,
    "mimeType" TEXT,
    "taille" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creePar" TEXT,
    CONSTRAINT "OuvrierDocument_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OuvrierDocument_ouvrierId_idx" ON "OuvrierDocument"("ouvrierId");
DO $$ BEGIN ALTER TABLE "OuvrierDocument" ADD CONSTRAINT "OuvrierDocument_ouvrierId_fkey" FOREIGN KEY ("ouvrierId") REFERENCES "Ouvrier"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ChantierDocument" (
    "id" TEXT NOT NULL,
    "chantierId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "categorie" "CategorieDocChantier" NOT NULL DEFAULT 'AUTRE',
    "fichier" TEXT NOT NULL,
    "mimeType" TEXT,
    "taille" INTEGER,
    "note" TEXT,
    "visibleClient" BOOLEAN NOT NULL DEFAULT false,
    "statutSignature" "StatutSignatureDoc" NOT NULL DEFAULT 'SANS',
    "signatureClientUrl" TEXT,
    "signatureClientLe" TIMESTAMP(3),
    "signatureClientPar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "creePar" TEXT,
    CONSTRAINT "ChantierDocument_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ChantierDocument_chantierId_idx" ON "ChantierDocument"("chantierId");
CREATE INDEX IF NOT EXISTS "ChantierDocument_chantierId_categorie_idx" ON "ChantierDocument"("chantierId", "categorie");
CREATE INDEX IF NOT EXISTS "ChantierDocument_statutSignature_idx" ON "ChantierDocument"("statutSignature");
DO $$ BEGIN ALTER TABLE "ChantierDocument" ADD CONSTRAINT "ChantierDocument_chantierId_fkey" FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
