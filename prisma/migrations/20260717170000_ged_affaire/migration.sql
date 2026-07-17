-- GED d'affaire (2026-07-17) : arborescence du dossier client alimentee par
-- la messagerie. SQL additif idempotent.
DO $$ BEGIN CREATE TYPE "CategorieDocAffaire" AS ENUM ('PHOTOS','PIECES_CLIENT','CONCEPTION','DEVIS','LIVRABLES','AUTRE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS "AffaireDocument" (
    "id" TEXT NOT NULL,
    "affaireId" TEXT NOT NULL,
    "categorie" "CategorieDocAffaire" NOT NULL DEFAULT 'AUTRE',
    "checklistCle" TEXT,
    "nom" TEXT NOT NULL,
    "fichier" TEXT NOT NULL,
    "mimeType" TEXT,
    "taille" INTEGER,
    "note" TEXT,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creePar" TEXT,
    CONSTRAINT "AffaireDocument_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AffaireDocument_affaireId_categorie_idx" ON "AffaireDocument"("affaireId", "categorie");
CREATE INDEX IF NOT EXISTS "AffaireDocument_affaireId_checklistCle_idx" ON "AffaireDocument"("affaireId", "checklistCle");
DO $$ BEGIN ALTER TABLE "AffaireDocument" ADD CONSTRAINT "AffaireDocument_affaireId_fkey" FOREIGN KEY ("affaireId") REFERENCES "Affaire"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
