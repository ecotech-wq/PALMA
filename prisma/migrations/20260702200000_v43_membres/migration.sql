-- v4.3 : membres de chantier et de canal, nouveaux roles, liaison ouvrier-compte.
-- SQL idempotent : rejouable sans effet de bord (IF NOT EXISTS partout).

-- 1. Nouveaux roles
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'OUVRIER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SOUS_TRAITANT';

-- 2. Table des membres de chantier
CREATE TABLE IF NOT EXISTS "ChantierMembre" (
    "id" TEXT NOT NULL,
    "chantierId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChantierMembre_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ChantierMembre_chantierId_userId_key"
    ON "ChantierMembre"("chantierId", "userId");
CREATE INDEX IF NOT EXISTS "ChantierMembre_userId_idx" ON "ChantierMembre"("userId");

DO $$ BEGIN
    ALTER TABLE "ChantierMembre" ADD CONSTRAINT "ChantierMembre_chantierId_fkey"
        FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "ChantierMembre" ADD CONSTRAINT "ChantierMembre_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "ChantierMembre" ADD CONSTRAINT "ChantierMembre_addedById_fkey"
        FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Table des membres de canal
CREATE TABLE IF NOT EXISTS "CanalMembre" (
    "canalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CanalMembre_pkey" PRIMARY KEY ("canalId", "userId")
);
CREATE INDEX IF NOT EXISTS "CanalMembre_userId_idx" ON "CanalMembre"("userId");

DO $$ BEGIN
    ALTER TABLE "CanalMembre" ADD CONSTRAINT "CanalMembre_canalId_fkey"
        FOREIGN KEY ("canalId") REFERENCES "Canal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "CanalMembre" ADD CONSTRAINT "CanalMembre_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "CanalMembre" ADD CONSTRAINT "CanalMembre_addedById_fkey"
        FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. Liaison ouvrier -> compte utilisateur (pointage QR, etape 2)
ALTER TABLE "Ouvrier" ADD COLUMN IF NOT EXISTS "userId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Ouvrier_userId_key" ON "Ouvrier"("userId");
DO $$ BEGIN
    ALTER TABLE "Ouvrier" ADD CONSTRAINT "Ouvrier_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5. Remplissage des membres de chantier depuis l'existant
-- 5a. Le chef affecte (Chantier.chefId)
INSERT INTO "ChantierMembre" ("id", "chantierId", "userId")
SELECT 'cm_chef_' || c."id", c."id", c."chefId"
FROM "Chantier" c
WHERE c."chefId" IS NOT NULL
ON CONFLICT ("chantierId", "userId") DO NOTHING;

-- 5b. Les clients rattaches (relation many-to-many _ChantierClients : A = Chantier, B = User)
INSERT INTO "ChantierMembre" ("id", "chantierId", "userId")
SELECT 'cm_cli_' || j."A" || '_' || j."B", j."A", j."B"
FROM "_ChantierClients" j
ON CONFLICT ("chantierId", "userId") DO NOTHING;

-- 5c. Les conducteurs existants deviennent membres de TOUS les chantiers non
-- archives : preserve le comportement courant (ils voyaient tout) ; l'admin
-- retirera ensuite chantier par chantier.
INSERT INTO "ChantierMembre" ("id", "chantierId", "userId")
SELECT 'cm_cond_' || u."id" || '_' || c."id", c."id", u."id"
FROM "User" u CROSS JOIN "Chantier" c
WHERE u."role" = 'CONDUCTEUR' AND u."status" = 'ACTIVE' AND c."archivedAt" IS NULL
ON CONFLICT ("chantierId", "userId") DO NOTHING;

-- 6. Remplissage des membres de canal (hors canal General, qui est de droit
-- pour l'equipe interne) : les membres internes du chantier sur chaque canal
-- non archive, plus les clients membres pour les canaux CLIENT.
INSERT INTO "CanalMembre" ("canalId", "userId")
SELECT ca."id", m."userId"
FROM "Canal" ca
JOIN "ChantierMembre" m ON m."chantierId" = ca."chantierId"
JOIN "User" u ON u."id" = m."userId"
WHERE ca."archivedAt" IS NULL
  AND ca."nom" <> 'Général'
  AND u."role" IN ('CONDUCTEUR', 'CHEF')
ON CONFLICT ("canalId", "userId") DO NOTHING;

INSERT INTO "CanalMembre" ("canalId", "userId")
SELECT ca."id", m."userId"
FROM "Canal" ca
JOIN "ChantierMembre" m ON m."chantierId" = ca."chantierId"
JOIN "User" u ON u."id" = m."userId"
WHERE ca."archivedAt" IS NULL
  AND ca."visibility" = 'CLIENT'
  AND u."role" = 'CLIENT'
ON CONFLICT ("canalId", "userId") DO NOTHING;
