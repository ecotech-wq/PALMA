-- AlterEnum : ajoute les nouveaux types de message système pour
-- propager toutes les actions des onglets vers la messagerie
ALTER TYPE "JournalMessageType" ADD VALUE IF NOT EXISTS 'SYSTEM_INCIDENT_RESOLU';
ALTER TYPE "JournalMessageType" ADD VALUE IF NOT EXISTS 'SYSTEM_COMMANDE_LIVREE';
ALTER TYPE "JournalMessageType" ADD VALUE IF NOT EXISTS 'SYSTEM_LOCATION';
ALTER TYPE "JournalMessageType" ADD VALUE IF NOT EXISTS 'SYSTEM_LOCATION_FIN';
ALTER TYPE "JournalMessageType" ADD VALUE IF NOT EXISTS 'SYSTEM_PLAN';
