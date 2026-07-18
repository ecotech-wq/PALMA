-- Procédures (pipelines) éditables par entreprise (2026-07-18). SQL additif
-- et idempotent : la table PipelineAffaire matérialise en données par espace
-- les 4 pipelines historiques (constantes de src/lib/affaires.ts, désormais
-- MODELES_PAR_DEFAUT dans src/lib/pipelines.ts), et Affaire.pipelineId
-- rattache chaque affaire à sa procédure (RESTRICT : une procédure ne se
-- supprime que si aucune affaire ne la référence).

CREATE TABLE IF NOT EXISTS "PipelineAffaire" (
    "id" TEXT NOT NULL,
    "espaceId" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "couleur" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "etapes" JSONB NOT NULL DEFAULT '[]',
    "checklistModele" JSONB NOT NULL DEFAULT '[]',
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PipelineAffaire_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PipelineAffaire_espaceId_cle_key" ON "PipelineAffaire"("espaceId", "cle");
CREATE INDEX IF NOT EXISTS "PipelineAffaire_espaceId_ordre_idx" ON "PipelineAffaire"("espaceId", "ordre");
DO $$ BEGIN ALTER TABLE "PipelineAffaire" ADD CONSTRAINT "PipelineAffaire_espaceId_fkey" FOREIGN KEY ("espaceId") REFERENCES "Espace"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Affaire" ADD COLUMN IF NOT EXISTS "pipelineId" TEXT;
DO $$ BEGIN ALTER TABLE "Affaire" ADD CONSTRAINT "Affaire_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "PipelineAffaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "Affaire_pipelineId_idx" ON "Affaire"("pipelineId");

-- Backfill : les 4 procédures par défaut pour CHAQUE espace existant, avec
-- les MÊMES clés que l'enum TypologieAffaire et les étapes / checklists
-- recopiées littéralement des constantes validées le 2026-07-17.
-- Idempotent : ON CONFLICT (espaceId, cle) DO NOTHING.

INSERT INTO "PipelineAffaire" ("id", "espaceId", "cle", "libelle", "couleur", "ordre", "etapes", "checklistModele", "actif", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, e."id", 'PERMIS_CONSTRUIRE', 'Permis de construire', 'ambre', 0,
  '[{"cle":"contact","libelle":"Prise de contact"},{"cle":"qualification","libelle":"Qualification"},{"cle":"visite","libelle":"Visite et relevé"},{"cle":"pieces","libelle":"Pièces client"},{"cle":"conception","libelle":"Conception"},{"cle":"devis","libelle":"Devis envoyé"},{"cle":"dossier","libelle":"Dossier en cours"},{"cle":"depose","libelle":"Déposé en mairie"},{"cle":"instruction","libelle":"Instruction"}]'::jsonb,
  '[{"cle":"cadastre","libelle":"Plan cadastral"},{"cle":"geometre","libelle":"Plan de géomètre"},{"cle":"topo","libelle":"Relevé topographique"},{"cle":"cu","libelle":"Certificat d''urbanisme"},{"cle":"photos","libelle":"Photos du site"}]'::jsonb,
  true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Espace" e
ON CONFLICT ("espaceId", "cle") DO NOTHING;

INSERT INTO "PipelineAffaire" ("id", "espaceId", "cle", "libelle", "couleur", "ordre", "etapes", "checklistModele", "actif", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, e."id", 'ETUDE_STRUCTURE', 'Étude structure', 'bleu-acier', 1,
  '[{"cle":"contact","libelle":"Prise de contact"},{"cle":"qualification","libelle":"Qualification"},{"cle":"pieces","libelle":"Pièces reçues"},{"cle":"devis","libelle":"Devis d''honoraires"},{"cle":"accepte","libelle":"Accepté"},{"cle":"etude","libelle":"Étude en cours"},{"cle":"livree","libelle":"Livrée"}]'::jsonb,
  '[]'::jsonb,
  true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Espace" e
ON CONFLICT ("espaceId", "cle") DO NOTHING;

INSERT INTO "PipelineAffaire" ("id", "espaceId", "cle", "libelle", "couleur", "ordre", "etapes", "checklistModele", "actif", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, e."id", 'TRAVAUX', 'Travaux', 'cuivre', 2,
  '[{"cle":"contact","libelle":"Prise de contact"},{"cle":"qualification","libelle":"Qualification"},{"cle":"visite","libelle":"Visite de site"},{"cle":"devis","libelle":"Métré et devis"},{"cle":"negociation","libelle":"Négociation"},{"cle":"signe","libelle":"Marché signé"}]'::jsonb,
  '[]'::jsonb,
  true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Espace" e
ON CONFLICT ("espaceId", "cle") DO NOTHING;

INSERT INTO "PipelineAffaire" ("id", "espaceId", "cle", "libelle", "couleur", "ordre", "etapes", "checklistModele", "actif", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, e."id", 'LABO', 'Labo', 'vert-mousse', 3,
  '[{"cle":"demande","libelle":"Demande"},{"cle":"devis","libelle":"Devis"},{"cle":"echantillons","libelle":"Échantillons reçus"},{"cle":"essais","libelle":"Essais en cours"},{"cle":"rapport","libelle":"Rapport livré"}]'::jsonb,
  '[]'::jsonb,
  true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Espace" e
ON CONFLICT ("espaceId", "cle") DO NOTHING;

-- Rattache chaque affaire existante au pipeline de son espace portant la
-- clé de sa typologie. Idempotent : ne touche que les lignes sans pipeline.
UPDATE "Affaire" a
SET "pipelineId" = p."id"
FROM "PipelineAffaire" p
WHERE a."pipelineId" IS NULL
  AND p."espaceId" = a."espaceId"
  AND p."cle" = a."typologie"::text;
