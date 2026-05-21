-- CreateTable: épinglage de chantiers par utilisateur
CREATE TABLE IF NOT EXISTS "UserChantierPin" (
    "userId"     TEXT NOT NULL,
    "chantierId" TEXT NOT NULL,
    "pinnedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserChantierPin_pkey" PRIMARY KEY ("userId", "chantierId")
);

CREATE INDEX IF NOT EXISTS "UserChantierPin_userId_idx" ON "UserChantierPin"("userId");

ALTER TABLE "UserChantierPin"
    ADD CONSTRAINT "UserChantierPin_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserChantierPin"
    ADD CONSTRAINT "UserChantierPin_chantierId_fkey"
    FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
