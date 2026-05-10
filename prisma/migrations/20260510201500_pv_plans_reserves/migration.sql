-- DropColumn (suppression de l'ancien tableau de réserves textuelles)
ALTER TABLE "PvReception" DROP COLUMN IF EXISTS "reserves";

-- CreateTable PvPlan
CREATE TABLE "PvPlan" (
    "id" TEXT NOT NULL,
    "pvId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "nom" TEXT,
    "mimeType" TEXT,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PvPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable PvReserve
CREATE TABLE "PvReserve" (
    "id" TEXT NOT NULL,
    "pvId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "texte" TEXT NOT NULL,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "zone" TEXT,
    "planId" TEXT,
    "posX" DOUBLE PRECISION,
    "posY" DOUBLE PRECISION,
    "leveLe" TIMESTAMP(3),
    "leveNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PvReserve_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PvReserve_pvId_numero_idx" ON "PvReserve"("pvId", "numero");

-- AddForeignKey
ALTER TABLE "PvPlan" ADD CONSTRAINT "PvPlan_pvId_fkey" FOREIGN KEY ("pvId") REFERENCES "PvReception"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PvReserve" ADD CONSTRAINT "PvReserve_pvId_fkey" FOREIGN KEY ("pvId") REFERENCES "PvReception"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PvReserve" ADD CONSTRAINT "PvReserve_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PvPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
