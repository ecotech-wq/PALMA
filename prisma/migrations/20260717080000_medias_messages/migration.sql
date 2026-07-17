-- Médias des fils messagerie et journal (2026-07-17) : mémos vocaux
-- (colonne "audios", fichiers bruts dans /uploads/audios) et pièces
-- jointes documentaires (colonne JSONB "documents", entrées
-- { url, nom, mimeType, taille }). SQL additif idempotent.
ALTER TABLE "JournalMessage" ADD COLUMN IF NOT EXISTS "audios" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "JournalMessage" ADD COLUMN IF NOT EXISTS "documents" JSONB NOT NULL DEFAULT '[]';
