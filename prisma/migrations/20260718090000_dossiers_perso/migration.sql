-- Dossiers personnalisés du dossier client (2026-07-18). SQL additif et
-- idempotent : Affaire.dossiersPerso porte le catalogue ({ cle, libelle })
-- et AffaireDocument.dossierPerso rattache un document à l'un d'eux
-- (non nul : le document appartient à ce dossier ; nul : à sa catégorie).
ALTER TABLE "Affaire" ADD COLUMN IF NOT EXISTS "dossiersPerso" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "AffaireDocument" ADD COLUMN IF NOT EXISTS "dossierPerso" TEXT;
CREATE INDEX IF NOT EXISTS "AffaireDocument_affaireId_dossierPerso_idx" ON "AffaireDocument"("affaireId", "dossierPerso");
