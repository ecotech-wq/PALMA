-- CreateTable: affectation m2m d'ouvriers sur une tâche
CREATE TABLE IF NOT EXISTS "TacheOuvrier" (
    "tacheId"   TEXT NOT NULL,
    "ouvrierId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TacheOuvrier_pkey" PRIMARY KEY ("tacheId", "ouvrierId")
);

CREATE INDEX IF NOT EXISTS "TacheOuvrier_ouvrierId_idx" ON "TacheOuvrier"("ouvrierId");

ALTER TABLE "TacheOuvrier"
    ADD CONSTRAINT "TacheOuvrier_tacheId_fkey"
    FOREIGN KEY ("tacheId") REFERENCES "Tache"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TacheOuvrier"
    ADD CONSTRAINT "TacheOuvrier_ouvrierId_fkey"
    FOREIGN KEY ("ouvrierId") REFERENCES "Ouvrier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
