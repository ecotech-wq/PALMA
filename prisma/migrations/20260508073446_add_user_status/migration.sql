-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');

-- AlterTable
-- Les users existants gardent l'accès (default ACTIVE).
-- Les nouveaux comptes inscrits via /register seront PENDING jusqu'à validation admin.
ALTER TABLE "User" ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';
