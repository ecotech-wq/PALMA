-- Socle espaces, suite : bornage des ANNUAIRES (ouvriers, équipes) et de la
-- paie par entreprise. Un ouvrier est salarié d'UNE entreprise ; une équipe
-- appartient à UNE entreprise. Reprise : l'existant rejoint l'espace qui
-- porte le module "chantier" (Autonhome), à défaut le premier espace créé.
-- SQL idempotent : rejouable sans effet de bord.

-- 1. Colonnes de rattachement
ALTER TABLE "Ouvrier" ADD COLUMN IF NOT EXISTS "espaceId" TEXT;
ALTER TABLE "Equipe"  ADD COLUMN IF NOT EXISTS "espaceId" TEXT;
CREATE INDEX IF NOT EXISTS "Ouvrier_espaceId_idx" ON "Ouvrier"("espaceId");
CREATE INDEX IF NOT EXISTS "Equipe_espaceId_idx"  ON "Equipe"("espaceId");

DO $$ BEGIN
    ALTER TABLE "Ouvrier" ADD CONSTRAINT "Ouvrier_espaceId_fkey"
        FOREIGN KEY ("espaceId") REFERENCES "Espace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "Equipe" ADD CONSTRAINT "Equipe_espaceId_fkey"
        FOREIGN KEY ("espaceId") REFERENCES "Espace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Reprise de l'existant : l'annuaire actuel est celui de l'entreprise
-- de construction (module "chantier"), à défaut le premier espace.
-- COALESCE : en PostgreSQL, ORDER BY expr DESC met les NULL en tête ; un
-- espace à "modules" NULL (insertion manuelle) capterait tout l'annuaire.
UPDATE "Ouvrier" SET "espaceId" = (
    SELECT e."id" FROM "Espace" e
    ORDER BY COALESCE(e."modules" @> ARRAY['chantier']::TEXT[], false) DESC,
             e."createdAt" ASC
    LIMIT 1
) WHERE "espaceId" IS NULL;

UPDATE "Equipe" SET "espaceId" = (
    SELECT e."id" FROM "Espace" e
    ORDER BY COALESCE(e."modules" @> ARRAY['chantier']::TEXT[], false) DESC,
             e."createdAt" ASC
    LIMIT 1
) WHERE "espaceId" IS NULL;
