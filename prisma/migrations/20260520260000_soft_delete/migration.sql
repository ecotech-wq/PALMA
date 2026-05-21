-- AlterTable: soft-delete sur les 3 modèles sensibles (corbeille 30j)
ALTER TABLE "Tache"             ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Commande"          ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "RapportChantier"   ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Tache_deletedAt_idx"           ON "Tache"("deletedAt");
CREATE INDEX IF NOT EXISTS "Commande_deletedAt_idx"        ON "Commande"("deletedAt");
CREATE INDEX IF NOT EXISTS "RapportChantier_deletedAt_idx" ON "RapportChantier"("deletedAt");
