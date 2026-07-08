-- Suivi financier, lot 1 (2026-07-08) : marché pivot, devis suivi, situations
-- de travaux, factures (double statut), encaissements, retenue de garantie.
-- LYNX SUIT le cycle commercial/financier (documents créés dans Odoo/Constructor)
-- sans le générer. SQL additif IDEMPOTENT, rejouable, appliqué au boot par
-- docker/migrate.cjs. Aucun destructif.

-- ── 1. Extension de l'enum ModePaiement (moyens d'encaissement client) ───────
DO $$ BEGIN ALTER TYPE "ModePaiement" ADD VALUE IF NOT EXISTS 'CHEQUE'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "ModePaiement" ADD VALUE IF NOT EXISTS 'CB'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "ModePaiement" ADD VALUE IF NOT EXISTS 'EFFET'; EXCEPTION WHEN others THEN NULL; END $$;

-- ── 2. Nouveaux enums (idempotents) ──────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "SourceDoc" AS ENUM ('ODOO','CONSTRUCTOR','MANUEL','AUTRE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "NatureMarche" AS ENUM ('PRIVE','PUBLIC'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "TypePrix" AS ENUM ('FERME','FERME_ACTUALISABLE','REVISABLE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ModeEcheance" AS ENUM ('DATE_FACTURE','FIN_DE_MOIS'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ModeFacturation" AS ENUM ('SITUATION_TRAVAUX','JALON_PHASE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "StatutMarche" AS ENUM ('BROUILLON','ACTIF','RECEPTIONNE','SOLDE','CLOTURE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "StatutDevis" AS ENUM ('BROUILLON','ENVOYE','RELANCE','ACCEPTE','REFUSE','EXPIRE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "BaseAvancement" AS ENUM ('BASE_TRAVAUX','BASE_FORFAIT_PHASE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "StatutSituation" AS ENUM ('BROUILLON','TRANSMISE','VISEE_MOE','ACCEPTEE','FACTUREE','PAYEE','PARTIELLEMENT_PAYEE','CONTESTEE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "TypeFacture" AS ENUM ('ACOMPTE','SITUATION','SOLDE','HONORAIRES','AVOIR'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "StatutEmission" AS ENUM ('BROUILLON','EMISE','ENVOYEE','ANNULEE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "StatutReglement" AS ENUM ('NON_PAYEE','PARTIELLEMENT_PAYEE','PAYEE','ANNULEE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "FormeGarantie" AS ENUM ('RETENUE_FONDS','CAUTION_PERSO_SOLIDAIRE','GARANTIE_PREMIERE_DEMANDE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "StatutRetenue" AS ENUM ('RETENUE','CONSIGNEE','CAUTIONNEE','LIBEREE','OPPOSITION'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 3. Marché (pivot) ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Marche" (
    "id" TEXT NOT NULL,
    "espaceId" TEXT NOT NULL,
    "chantierId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "natureMarche" "NatureMarche" NOT NULL DEFAULT 'PRIVE',
    "modeFacturation" "ModeFacturation" NOT NULL DEFAULT 'SITUATION_TRAVAUX',
    "clientUserId" TEXT,
    "maitreOuvrageNom" TEXT,
    "montantInitialHT" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "montantCourantHT" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "typePrix" "TypePrix" NOT NULL DEFAULT 'FERME',
    "tauxRetenueGarantie" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "delaiPaiementJours" INTEGER NOT NULL DEFAULT 30,
    "modeCalculEcheance" "ModeEcheance" NOT NULL DEFAULT 'DATE_FACTURE',
    "periodiciteSituationsMois" INTEGER NOT NULL DEFAULT 1,
    "dateSignature" TIMESTAMP(3),
    "statut" "StatutMarche" NOT NULL DEFAULT 'BROUILLON',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "creePar" TEXT,
    CONSTRAINT "Marche_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Marche_espaceId_idx" ON "Marche"("espaceId");
CREATE INDEX IF NOT EXISTS "Marche_chantierId_idx" ON "Marche"("chantierId");
CREATE INDEX IF NOT EXISTS "Marche_statut_idx" ON "Marche"("statut");
DO $$ BEGIN ALTER TABLE "Marche" ADD CONSTRAINT "Marche_espaceId_fkey" FOREIGN KEY ("espaceId") REFERENCES "Espace"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Marche" ADD CONSTRAINT "Marche_chantierId_fkey" FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Marche" ADD CONSTRAINT "Marche_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 4. Avenant ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Avenant" (
    "id" TEXT NOT NULL,
    "marcheId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "objet" TEXT NOT NULL,
    "montantHT" DECIMAL(12,2) NOT NULL,
    "dateSignature" TIMESTAMP(3),
    "signe" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Avenant_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Avenant_marcheId_idx" ON "Avenant"("marcheId");
DO $$ BEGIN ALTER TABLE "Avenant" ADD CONSTRAINT "Avenant_marcheId_fkey" FOREIGN KEY ("marcheId") REFERENCES "Marche"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 5. Devis ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Devis" (
    "id" TEXT NOT NULL,
    "espaceId" TEXT NOT NULL,
    "chantierId" TEXT,
    "marcheId" TEXT,
    "clientUserId" TEXT,
    "source" "SourceDoc" NOT NULL DEFAULT 'MANUEL',
    "referenceExterne" TEXT,
    "lienExterne" TEXT,
    "fichierPdf" TEXT,
    "objet" TEXT NOT NULL,
    "montantHT" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "montantTVA" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "montantTTC" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "statut" "StatutDevis" NOT NULL DEFAULT 'BROUILLON',
    "dateEmission" TIMESTAMP(3),
    "dateEnvoi" TIMESTAMP(3),
    "dateValidite" TIMESTAMP(3),
    "dateAcceptation" TIMESTAMP(3),
    "dateRefus" TIMESTAMP(3),
    "motifRefus" TEXT,
    "nbRelances" INTEGER NOT NULL DEFAULT 0,
    "dateDerniereRelance" TIMESTAMP(3),
    "prochaineRelance" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "creePar" TEXT,
    CONSTRAINT "Devis_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Devis_espaceId_idx" ON "Devis"("espaceId");
CREATE INDEX IF NOT EXISTS "Devis_chantierId_idx" ON "Devis"("chantierId");
CREATE INDEX IF NOT EXISTS "Devis_statut_idx" ON "Devis"("statut");
DO $$ BEGIN ALTER TABLE "Devis" ADD CONSTRAINT "Devis_espaceId_fkey" FOREIGN KEY ("espaceId") REFERENCES "Espace"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Devis" ADD CONSTRAINT "Devis_chantierId_fkey" FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Devis" ADD CONSTRAINT "Devis_marcheId_fkey" FOREIGN KEY ("marcheId") REFERENCES "Marche"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Devis" ADD CONSTRAINT "Devis_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 6. Facture (créée avant Situation : la FK situation.factureId la référence) ─
CREATE TABLE IF NOT EXISTS "Facture" (
    "id" TEXT NOT NULL,
    "espaceId" TEXT NOT NULL,
    "chantierId" TEXT,
    "marcheId" TEXT,
    "devisId" TEXT,
    "clientUserId" TEXT,
    "type" "TypeFacture" NOT NULL DEFAULT 'SITUATION',
    "avoirDeFactureId" TEXT,
    "source" "SourceDoc" NOT NULL DEFAULT 'MANUEL',
    "referenceExterne" TEXT,
    "lienExterne" TEXT,
    "fichierPdf" TEXT,
    "objet" TEXT,
    "montantHT" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "montantTVA" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "montantTTC" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "autoliquidation" BOOLEAN NOT NULL DEFAULT false,
    "retenueGarantieMontant" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "montantPaye" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "statutEmission" "StatutEmission" NOT NULL DEFAULT 'BROUILLON',
    "statutReglement" "StatutReglement" NOT NULL DEFAULT 'NON_PAYEE',
    "dateEmission" TIMESTAMP(3),
    "dateEcheance" DATE,
    "dateEnvoi" TIMESTAMP(3),
    "datePaiementComplet" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "creePar" TEXT,
    CONSTRAINT "Facture_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Facture_espaceId_idx" ON "Facture"("espaceId");
CREATE INDEX IF NOT EXISTS "Facture_chantierId_idx" ON "Facture"("chantierId");
CREATE INDEX IF NOT EXISTS "Facture_statutReglement_idx" ON "Facture"("statutReglement");
CREATE INDEX IF NOT EXISTS "Facture_dateEcheance_idx" ON "Facture"("dateEcheance");
DO $$ BEGIN ALTER TABLE "Facture" ADD CONSTRAINT "Facture_espaceId_fkey" FOREIGN KEY ("espaceId") REFERENCES "Espace"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Facture" ADD CONSTRAINT "Facture_chantierId_fkey" FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Facture" ADD CONSTRAINT "Facture_marcheId_fkey" FOREIGN KEY ("marcheId") REFERENCES "Marche"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Facture" ADD CONSTRAINT "Facture_devisId_fkey" FOREIGN KEY ("devisId") REFERENCES "Devis"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Facture" ADD CONSTRAINT "Facture_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Facture" ADD CONSTRAINT "Facture_avoirDeFactureId_fkey" FOREIGN KEY ("avoirDeFactureId") REFERENCES "Facture"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 7. Situation de travaux ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "SituationTravaux" (
    "id" TEXT NOT NULL,
    "espaceId" TEXT NOT NULL,
    "chantierId" TEXT NOT NULL,
    "marcheId" TEXT NOT NULL,
    "base" "BaseAvancement" NOT NULL DEFAULT 'BASE_TRAVAUX',
    "phaseEtudeId" TEXT,
    "numeroOrdre" INTEGER NOT NULL,
    "periodeDebut" DATE NOT NULL,
    "periodeFin" DATE NOT NULL,
    "dateEtablissement" DATE NOT NULL,
    "avancementCumulePct" DECIMAL(5,2) NOT NULL,
    "montantReferenceHT" DECIMAL(12,2) NOT NULL,
    "montantCumuleHT" DECIMAL(12,2) NOT NULL,
    "montantCumuleAnterieurHT" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "montantPeriodeHT" DECIMAL(12,2) NOT NULL,
    "retenueGarantiePeriode" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "imputationAcompte" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tauxTVA" DECIMAL(5,2) NOT NULL DEFAULT 20,
    "autoliquidation" BOOLEAN NOT NULL DEFAULT false,
    "netAPayerPeriode" DECIMAL(12,2) NOT NULL,
    "statut" "StatutSituation" NOT NULL DEFAULT 'BROUILLON',
    "dateVisaMOE" TIMESTAMP(3),
    "valideurMoeId" TEXT,
    "factureId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "creePar" TEXT,
    CONSTRAINT "SituationTravaux_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SituationTravaux_factureId_key" ON "SituationTravaux"("factureId");
CREATE UNIQUE INDEX IF NOT EXISTS "SituationTravaux_marcheId_numeroOrdre_key" ON "SituationTravaux"("marcheId","numeroOrdre");
CREATE INDEX IF NOT EXISTS "SituationTravaux_espaceId_idx" ON "SituationTravaux"("espaceId");
CREATE INDEX IF NOT EXISTS "SituationTravaux_chantierId_idx" ON "SituationTravaux"("chantierId");
CREATE INDEX IF NOT EXISTS "SituationTravaux_statut_idx" ON "SituationTravaux"("statut");
DO $$ BEGIN ALTER TABLE "SituationTravaux" ADD CONSTRAINT "SituationTravaux_espaceId_fkey" FOREIGN KEY ("espaceId") REFERENCES "Espace"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "SituationTravaux" ADD CONSTRAINT "SituationTravaux_chantierId_fkey" FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "SituationTravaux" ADD CONSTRAINT "SituationTravaux_marcheId_fkey" FOREIGN KEY ("marcheId") REFERENCES "Marche"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "SituationTravaux" ADD CONSTRAINT "SituationTravaux_phaseEtudeId_fkey" FOREIGN KEY ("phaseEtudeId") REFERENCES "PhaseEtude"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "SituationTravaux" ADD CONSTRAINT "SituationTravaux_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "Facture"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 8. Encaissement ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Encaissement" (
    "id" TEXT NOT NULL,
    "espaceId" TEXT NOT NULL,
    "chantierId" TEXT,
    "factureId" TEXT NOT NULL,
    "montant" DECIMAL(12,2) NOT NULL,
    "dateEncaissement" DATE NOT NULL,
    "mode" "ModePaiement" NOT NULL DEFAULT 'VIREMENT',
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creePar" TEXT,
    CONSTRAINT "Encaissement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Encaissement_espaceId_idx" ON "Encaissement"("espaceId");
CREATE INDEX IF NOT EXISTS "Encaissement_factureId_idx" ON "Encaissement"("factureId");
DO $$ BEGIN ALTER TABLE "Encaissement" ADD CONSTRAINT "Encaissement_espaceId_fkey" FOREIGN KEY ("espaceId") REFERENCES "Espace"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Encaissement" ADD CONSTRAINT "Encaissement_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "Facture"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 9. Retenue de garantie (une par marché) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS "RetenueGarantie" (
    "id" TEXT NOT NULL,
    "espaceId" TEXT NOT NULL,
    "chantierId" TEXT NOT NULL,
    "marcheId" TEXT NOT NULL,
    "tauxPct" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "montantRetenuCumul" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "forme" "FormeGarantie" NOT NULL DEFAULT 'RETENUE_FONDS',
    "dateDebut" TIMESTAMP(3),
    "dateEcheanceLiberation" TIMESTAMP(3),
    "statut" "StatutRetenue" NOT NULL DEFAULT 'RETENUE',
    "dateLiberation" TIMESTAMP(3),
    "motifOpposition" TEXT,
    "organismeCaution" TEXT,
    "referenceCaution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RetenueGarantie_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RetenueGarantie_marcheId_key" ON "RetenueGarantie"("marcheId");
CREATE INDEX IF NOT EXISTS "RetenueGarantie_espaceId_idx" ON "RetenueGarantie"("espaceId");
CREATE INDEX IF NOT EXISTS "RetenueGarantie_chantierId_idx" ON "RetenueGarantie"("chantierId");
CREATE INDEX IF NOT EXISTS "RetenueGarantie_statut_idx" ON "RetenueGarantie"("statut");
DO $$ BEGIN ALTER TABLE "RetenueGarantie" ADD CONSTRAINT "RetenueGarantie_espaceId_fkey" FOREIGN KEY ("espaceId") REFERENCES "Espace"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "RetenueGarantie" ADD CONSTRAINT "RetenueGarantie_chantierId_fkey" FOREIGN KEY ("chantierId") REFERENCES "Chantier"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "RetenueGarantie" ADD CONSTRAINT "RetenueGarantie_marcheId_fkey" FOREIGN KEY ("marcheId") REFERENCES "Marche"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 10. Backfill : un Marché par chantier existant, depuis les budgets saisis ─
-- Reprise non destructive : chaque chantier reçoit un marché « repris » dont le
-- montant courant = budgetEspeces + budgetVirement. Les champs budget restent en
-- base ; getFinanceChantier lira le marché quand il existe, sinon les budgets.
-- Retenue de garantie 5% pour les projets de travaux, 0% pour les études.
INSERT INTO "Marche" ("id", "espaceId", "chantierId", "reference", "modeFacturation",
    "montantInitialHT", "montantCourantHT", "tauxRetenueGarantie", "statut", "note", "updatedAt")
SELECT 'mar_' || c."id", c."espaceId", c."id",
       'Marché repris', CASE WHEN c."type" = 'ETUDE' THEN 'JALON_PHASE'::"ModeFacturation" ELSE 'SITUATION_TRAVAUX'::"ModeFacturation" END,
       COALESCE(c."budgetEspeces",0) + COALESCE(c."budgetVirement",0),
       COALESCE(c."budgetEspeces",0) + COALESCE(c."budgetVirement",0),
       CASE WHEN c."type" = 'ETUDE' THEN 0 ELSE 5 END,
       'BROUILLON'::"StatutMarche",
       'Repris automatiquement des budgets Chantier au déploiement du suivi financier.',
       CURRENT_TIMESTAMP
FROM "Chantier" c
WHERE c."archivedAt" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "Marche" m WHERE m."chantierId" = c."id");
