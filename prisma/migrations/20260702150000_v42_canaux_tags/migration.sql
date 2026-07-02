-- ============================================================
-- LYNX v4.2 : canaux de messagerie + tags -> fiches
-- SQL Postgres pur, idempotent (compatible docker/migrate.cjs).
-- 1. Nouveaux types SYSTEM_TACHE / SYSTEM_RESERVE sur le fil.
-- 2. Enum CanalVisibility + table Canal (un canal appartient a un chantier).
-- 3. Colonnes canalId / tacheId / reserveId sur JournalMessage.
-- 4. Table MessageTag (tag pose sur un message + fiche creee).
-- 5. Rattrapage : un canal "Général" INTERNE par chantier existant,
--    et tous les messages historiques y sont rattaches.
-- ============================================================

-- 1. Extension de l'enum des types de message
ALTER TYPE "JournalMessageType" ADD VALUE IF NOT EXISTS 'SYSTEM_TACHE';
ALTER TYPE "JournalMessageType" ADD VALUE IF NOT EXISTS 'SYSTEM_RESERVE';

-- 2. Enum de visibilite des canaux
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CanalVisibility') THEN
    CREATE TYPE "CanalVisibility" AS ENUM ('INTERNE', 'CLIENT', 'SOUS_TRAITANT');
  END IF;
END
$$;

-- 2b. Table Canal
CREATE TABLE IF NOT EXISTS "Canal" (
  "id"          TEXT NOT NULL,
  "chantierId"  TEXT NOT NULL,
  "nom"         TEXT NOT NULL,
  "visibility"  "CanalVisibility" NOT NULL DEFAULT 'INTERNE',
  "ordre"       INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "archivedAt"  TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Canal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Canal_chantierId_nom_key" ON "Canal"("chantierId", "nom");
CREATE INDEX IF NOT EXISTS "Canal_chantierId_ordre_idx" ON "Canal"("chantierId", "ordre");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Canal_chantierId_fkey') THEN
    ALTER TABLE "Canal" ADD CONSTRAINT "Canal_chantierId_fkey"
      FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Canal_createdById_fkey') THEN
    ALTER TABLE "Canal" ADD CONSTRAINT "Canal_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- 3. Colonnes nouvelles sur JournalMessage
ALTER TABLE "JournalMessage" ADD COLUMN IF NOT EXISTS "canalId" TEXT;
ALTER TABLE "JournalMessage" ADD COLUMN IF NOT EXISTS "tacheId" TEXT;
ALTER TABLE "JournalMessage" ADD COLUMN IF NOT EXISTS "reserveId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JournalMessage_canalId_fkey') THEN
    ALTER TABLE "JournalMessage" ADD CONSTRAINT "JournalMessage_canalId_fkey"
      FOREIGN KEY ("canalId") REFERENCES "Canal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "JournalMessage_canalId_idx" ON "JournalMessage"("canalId");

-- 4. Table MessageTag
CREATE TABLE IF NOT EXISTS "MessageTag" (
  "messageId"  TEXT NOT NULL,
  "tagCode"    TEXT NOT NULL,
  "taggedById" TEXT,
  "entity"     TEXT,
  "entityId"   TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageTag_pkey" PRIMARY KEY ("messageId", "tagCode")
);

CREATE INDEX IF NOT EXISTS "MessageTag_entity_entityId_idx" ON "MessageTag"("entity", "entityId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MessageTag_messageId_fkey') THEN
    ALTER TABLE "MessageTag" ADD CONSTRAINT "MessageTag_messageId_fkey"
      FOREIGN KEY ("messageId") REFERENCES "JournalMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MessageTag_taggedById_fkey') THEN
    ALTER TABLE "MessageTag" ADD CONSTRAINT "MessageTag_taggedById_fkey"
      FOREIGN KEY ("taggedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- 5. Rattrapage : canal "Général" par chantier + rattachement des messages
INSERT INTO "Canal" ("id", "chantierId", "nom", "visibility", "ordre")
SELECT 'cgen_' || c."id", c."id", 'Général', 'INTERNE', 0
FROM "Chantier" c
ON CONFLICT ("chantierId", "nom") DO NOTHING;

UPDATE "JournalMessage" m
SET "canalId" = 'cgen_' || m."chantierId"
WHERE m."canalId" IS NULL
  AND EXISTS (SELECT 1 FROM "Canal" k WHERE k."id" = 'cgen_' || m."chantierId");
