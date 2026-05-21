-- CreateTable: journal d'audit append-only
CREATE TABLE IF NOT EXISTS "AuditEntry" (
    "id"        TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId"    TEXT,
    "userName"  TEXT NOT NULL,
    "userRole"  TEXT NOT NULL,
    "action"    TEXT NOT NULL,
    "entity"    TEXT NOT NULL,
    "entityId"  TEXT,
    "summary"   TEXT NOT NULL,
    "metadata"  JSONB,

    CONSTRAINT "AuditEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuditEntry_createdAt_idx" ON "AuditEntry"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AuditEntry_action_idx" ON "AuditEntry"("action");
CREATE INDEX IF NOT EXISTS "AuditEntry_entity_entityId_idx" ON "AuditEntry"("entity", "entityId");
CREATE INDEX IF NOT EXISTS "AuditEntry_userId_idx" ON "AuditEntry"("userId");

ALTER TABLE "AuditEntry"
    ADD CONSTRAINT "AuditEntry_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
