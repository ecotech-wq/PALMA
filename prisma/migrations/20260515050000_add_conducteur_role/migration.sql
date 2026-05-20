-- Ajoute le rôle CONDUCTEUR entre ADMIN et CHEF
-- (intermédiaire : voit les prix locations/commandes/matériel, fait OPC/OPR,
-- valide les demandes, mais pas la paie complète)
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CONDUCTEUR' BEFORE 'CHEF';
