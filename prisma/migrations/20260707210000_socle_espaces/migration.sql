-- Socle plateforme : ESPACES (une entreprise = un espace, modèle Odoo :
-- une seule app, une seule base, sélecteur d'entreprise, modules activables
-- par espace, rôle PAR espace). Arbitré par Youssoufou le 2026-07-07.
-- SQL idempotent : rejouable sans effet de bord.

-- 1. Espaces (entreprises)
CREATE TABLE IF NOT EXISTS "Espace" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "couleur" TEXT,
    "modules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Espace_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Espace_slug_key" ON "Espace"("slug");

-- 2. Adhésions avec rôle PAR espace (la vraie séparation des équipes)
CREATE TABLE IF NOT EXISTS "EspaceMembre" (
    "id" TEXT NOT NULL,
    "espaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CHEF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EspaceMembre_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "EspaceMembre_espaceId_userId_key"
    ON "EspaceMembre"("espaceId", "userId");
CREATE INDEX IF NOT EXISTS "EspaceMembre_userId_idx" ON "EspaceMembre"("userId");

DO $$ BEGIN
    ALTER TABLE "EspaceMembre" ADD CONSTRAINT "EspaceMembre_espaceId_fkey"
        FOREIGN KEY ("espaceId") REFERENCES "Espace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "EspaceMembre" ADD CONSTRAINT "EspaceMembre_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Rattachement des projets à un espace
ALTER TABLE "Chantier" ADD COLUMN IF NOT EXISTS "espaceId" TEXT;
CREATE INDEX IF NOT EXISTS "Chantier_espaceId_idx" ON "Chantier"("espaceId");

-- 4. Reprise de l'existant : les deux espaces de Youssoufou
INSERT INTO "Espace" ("id", "nom", "slug", "modules", "updatedAt")
VALUES ('esp_autonhome', 'Autonhome', 'autonhome',
        ARRAY['chantier']::TEXT[], CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
INSERT INTO "Espace" ("id", "nom", "slug", "modules", "updatedAt")
VALUES ('esp_ecotech', 'EcoTech', 'ecotech',
        ARRAY['be']::TEXT[], CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

-- Tout l'existant type CHANTIER -> Autonhome ; type ETUDE -> EcoTech.
UPDATE "Chantier" SET "espaceId" = 'esp_autonhome'
WHERE "espaceId" IS NULL AND "type" = 'CHANTIER';
UPDATE "Chantier" SET "espaceId" = 'esp_ecotech'
WHERE "espaceId" IS NULL AND "type" = 'ETUDE';

-- Verrou après reprise : tout projet a un espace.
DO $$ BEGIN
    ALTER TABLE "Chantier" ALTER COLUMN "espaceId" SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "Chantier" ADD CONSTRAINT "Chantier_espaceId_fkey"
        FOREIGN KEY ("espaceId") REFERENCES "Espace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5. Adhésions de reprise : chaque utilisateur ACTIF garde son rôle actuel
-- dans Autonhome ; les ADMIN sont aussi admins d'EcoTech (Youssoufou pilote
-- les deux). Les affinages se font ensuite dans l'interface.
INSERT INTO "EspaceMembre" ("id", "espaceId", "userId", "role")
SELECT 'em_auto_' || u."id", 'esp_autonhome', u."id", u."role"
FROM "User" u
WHERE u."status" = 'ACTIVE'
ON CONFLICT ("espaceId", "userId") DO NOTHING;

INSERT INTO "EspaceMembre" ("id", "espaceId", "userId", "role")
SELECT 'em_eco_' || u."id", 'esp_ecotech', u."id", 'ADMIN'::"Role"
FROM "User" u
WHERE u."status" = 'ACTIVE' AND u."role" = 'ADMIN'
ON CONFLICT ("espaceId", "userId") DO NOTHING;
