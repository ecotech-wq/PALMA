-- AlterTable: récurrence RRule sur les tâches
ALTER TABLE "Tache" ADD COLUMN IF NOT EXISTS "recurrence"        TEXT;
ALTER TABLE "Tache" ADD COLUMN IF NOT EXISTS "recurrenceParentId" TEXT;
