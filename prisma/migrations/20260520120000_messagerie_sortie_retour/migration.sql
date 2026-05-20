-- Étend l'enum JournalMessageType pour le composer chat-first :
-- on peut désormais poster une SORTIE / RETOUR matériel directement
-- depuis la messagerie du chantier.
ALTER TYPE "JournalMessageType" ADD VALUE IF NOT EXISTS 'SYSTEM_SORTIE';
ALTER TYPE "JournalMessageType" ADD VALUE IF NOT EXISTS 'SYSTEM_RETOUR';

-- Lien vers SortieMateriel pour ces nouveaux messages
ALTER TABLE "JournalMessage" ADD COLUMN IF NOT EXISTS "sortieId" TEXT;
