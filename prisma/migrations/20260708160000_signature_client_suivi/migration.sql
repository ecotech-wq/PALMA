-- Suivi financier, volet client (2026-07-08) : signature électronique du client
-- sur les devis et les situations (demandes d'acompte), et drapeaux de
-- visibilité du volet contractuel/financier. Le client ne voit QUE ce que
-- l'admin lui ouvre (drapeaux à false par défaut).
-- SQL additif IDEMPOTENT, appliqué au boot par docker/migrate.cjs.

-- Signature client sur Devis
ALTER TABLE "Devis" ADD COLUMN IF NOT EXISTS "signatureClientUrl" TEXT;
ALTER TABLE "Devis" ADD COLUMN IF NOT EXISTS "signatureClientLe" TIMESTAMP(3);
ALTER TABLE "Devis" ADD COLUMN IF NOT EXISTS "signatureClientId" TEXT;
ALTER TABLE "Devis" ADD COLUMN IF NOT EXISTS "signatureClientNom" TEXT;

-- Signature client sur SituationTravaux
ALTER TABLE "SituationTravaux" ADD COLUMN IF NOT EXISTS "signatureClientUrl" TEXT;
ALTER TABLE "SituationTravaux" ADD COLUMN IF NOT EXISTS "signatureClientLe" TIMESTAMP(3);
ALTER TABLE "SituationTravaux" ADD COLUMN IF NOT EXISTS "signatureClientId" TEXT;
ALTER TABLE "SituationTravaux" ADD COLUMN IF NOT EXISTS "signatureClientNom" TEXT;

-- Drapeaux de visibilité du volet contractuel/financier (fermés par défaut)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "showDevis" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "showSituations" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "showFactures" BOOLEAN NOT NULL DEFAULT false;
