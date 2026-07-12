-- Position manuelle des noeuds PERT (glisser-deposer, partagee par l'equipe).
-- NULL = disposition automatique. SQL additif idempotent.
ALTER TABLE "Tache" ADD COLUMN IF NOT EXISTS "pertX" DOUBLE PRECISION;
ALTER TABLE "Tache" ADD COLUMN IF NOT EXISTS "pertY" DOUBLE PRECISION;
