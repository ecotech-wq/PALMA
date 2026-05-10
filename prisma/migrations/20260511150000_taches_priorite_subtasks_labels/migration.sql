-- Tache : priorite, parentId (sous-taches), ordre
ALTER TABLE "Tache" ADD COLUMN "priorite" INTEGER NOT NULL DEFAULT 4;
ALTER TABLE "Tache" ADD COLUMN "parentId" TEXT;
ALTER TABLE "Tache" ADD COLUMN "ordre" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Tache" ADD CONSTRAINT "Tache_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "Tache"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Tache_parentId_idx" ON "Tache"("parentId");

-- Labels (tags) globaux ou par chantier
CREATE TABLE "Label" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "couleur" TEXT NOT NULL DEFAULT '#3b82f6',
    "chantierId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Label_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Label_chantierId_idx" ON "Label"("chantierId");

ALTER TABLE "Label" ADD CONSTRAINT "Label_chantierId_fkey"
  FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Many-to-many Tache <-> Label
CREATE TABLE "TacheLabel" (
    "tacheId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,

    CONSTRAINT "TacheLabel_pkey" PRIMARY KEY ("tacheId", "labelId")
);

CREATE INDEX "TacheLabel_labelId_idx" ON "TacheLabel"("labelId");

ALTER TABLE "TacheLabel" ADD CONSTRAINT "TacheLabel_tacheId_fkey"
  FOREIGN KEY ("tacheId") REFERENCES "Tache"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TacheLabel" ADD CONSTRAINT "TacheLabel_labelId_fkey"
  FOREIGN KEY ("labelId") REFERENCES "Label"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
