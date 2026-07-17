-- Type de plan personnalisable (2026-07-18) : classement libre des plans
-- d'un chantier (ex : Exécution, Ferraillage, Réseaux...), suggéré depuis
-- les types déjà employés sur le chantier. SQL additif et idempotent.
ALTER TABLE "PlanChantier" ADD COLUMN IF NOT EXISTS "type" TEXT;
CREATE INDEX IF NOT EXISTS "PlanChantier_chantierId_type_idx" ON "PlanChantier"("chantierId", "type");
