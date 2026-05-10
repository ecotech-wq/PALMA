-- Ajout du rôle CLIENT pour donner un accès lecture seule à un
-- donneur d'ordre / propriétaire sur ses chantiers.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CLIENT';

-- Table de jointure M2M pour assigner des clients à des chantiers
CREATE TABLE "_ChantierClients" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL,

  CONSTRAINT "_ChantierClients_AB_pkey" PRIMARY KEY ("A","B")
);

CREATE INDEX "_ChantierClients_B_index" ON "_ChantierClients"("B");

ALTER TABLE "_ChantierClients"
  ADD CONSTRAINT "_ChantierClients_A_fkey"
  FOREIGN KEY ("A") REFERENCES "Chantier"("id") ON DELETE CASCADE;

ALTER TABLE "_ChantierClients"
  ADD CONSTRAINT "_ChantierClients_B_fkey"
  FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE;
