-- Singleton pour les préférences de l'app
CREATE TABLE "AppSettings" (
  "id" TEXT NOT NULL DEFAULT 'singleton',
  "joursParMois" INTEGER NOT NULL DEFAULT 23,
  "joursParSemaine" INTEGER NOT NULL DEFAULT 6,
  "modePaieDefault" TEXT NOT NULL DEFAULT 'ESPECES',
  "nomEntreprise" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);
