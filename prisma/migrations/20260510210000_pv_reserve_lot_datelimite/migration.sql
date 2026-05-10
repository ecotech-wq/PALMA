-- AlterTable : ajout des colonnes Lot (corps de métier) et dateLimite (Pour le)
ALTER TABLE "PvReserve" ADD COLUMN "lot" TEXT;
ALTER TABLE "PvReserve" ADD COLUMN "dateLimite" DATE;
