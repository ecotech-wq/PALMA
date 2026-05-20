-- Suivi de lecture par utilisateur et par ressource — utilisé pour
-- calculer les badges "non lu" dans la sidebar (messagerie chantier,
-- incidents, demandes...).
CREATE TABLE "UserReadState" (
    "userId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserReadState_pkey" PRIMARY KEY ("userId", "resource")
);

CREATE INDEX "UserReadState_userId_idx" ON "UserReadState"("userId");

ALTER TABLE "UserReadState" ADD CONSTRAINT "UserReadState_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
