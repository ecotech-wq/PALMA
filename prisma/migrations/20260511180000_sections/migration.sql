-- Sections (Todoist-like) pour grouper les tâches par chantier
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "chantierId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "couleur" TEXT,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Section_chantierId_idx" ON "Section"("chantierId");

ALTER TABLE "Section" ADD CONSTRAINT "Section_chantierId_fkey"
  FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Lien optionnel d'une tâche vers une section (SetNull si suppression)
ALTER TABLE "Tache" ADD COLUMN "sectionId" TEXT;

ALTER TABLE "Tache" ADD CONSTRAINT "Tache_sectionId_fkey"
  FOREIGN KEY ("sectionId") REFERENCES "Section"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Tache_sectionId_idx" ON "Tache"("sectionId");
