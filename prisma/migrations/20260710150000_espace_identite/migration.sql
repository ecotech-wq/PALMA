-- Identité d'entreprise pour l'entête des documents (2026-07-10) :
-- logo + coordonnées par espace. SQL additif idempotent.
ALTER TABLE "Espace" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;
ALTER TABLE "Espace" ADD COLUMN IF NOT EXISTS "adresse" TEXT;
ALTER TABLE "Espace" ADD COLUMN IF NOT EXISTS "telephone" TEXT;
ALTER TABLE "Espace" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "Espace" ADD COLUMN IF NOT EXISTS "siret" TEXT;
