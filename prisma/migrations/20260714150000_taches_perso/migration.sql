-- Taches personnelles (2026-07-14) : une tache peut vivre sans chantier,
-- rattachee a son proprietaire. SQL additif idempotent.
ALTER TABLE "Tache" ALTER COLUMN "chantierId" DROP NOT NULL;
ALTER TABLE "Tache" ADD COLUMN IF NOT EXISTS "proprietaireId" TEXT;
DO $$ BEGIN ALTER TABLE "Tache" ADD CONSTRAINT "Tache_proprietaireId_fkey" FOREIGN KEY ("proprietaireId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "Tache_proprietaireId_idx" ON "Tache"("proprietaireId");
