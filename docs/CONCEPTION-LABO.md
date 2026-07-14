# Module Laboratoire (OptimusLab) : note de conception V1

Note de recherche du 2026-07-13 (sources en bas), préparatoire au chantier du
module labo. Périmètre proposé, à valider par Youssoufou avant implémentation.

## Le noyau d'entités (hérité du modèle LIMS, référence Senaite)

Cinq objets suffisent au cycle complet, plus un sixième minimal :

1. **Prélèvement / Échantillon** : matériau, origine, date, préleveur, lien
   optionnel vers un chantier LYNX ou une formulation R&D.
2. **Éprouvette** : identifiant unique imprimable, géométrie, date de
   fabrication, conditions de cure.
3. **Essai** : type, norme OU protocole libre (champ texte : indispensable
   pour la terre crue et les biosourcés, sans protocole consensuel), échéance,
   appareil, opérateur, statut (planifié, en cours, validé).
4. **Résultat** : valeur, unité, incertitude si connue, conformité vs seuil.
5. **Rapport d'essai** : PDF structuré selon la logique ISO/IEC 17025 § 7.8
   (identification, méthode, conditions, résultats, conformité, signature),
   même sans viser l'accréditation.
6. **Équipement** : nom + date de dernier étalonnage (traçabilité métrologique
   minimale).

## Les deux flux, même noyau, cinématiques distinctes

**Essais chantier (béton, flux court et normé)** : prélèvement sur un chantier
LYNX existant, plusieurs éprouvettes par gâchée, cure EN 12390-2, écrasements
planifiés automatiquement à J+7 et J+28 avec relances (le moteur de relances
existe déjà), comparaison automatique à la classe prescrite (ex. C25/30),
alerte de non-conformité au chef de chantier. Écran clé : tableau de bord des
échéances d'écrasement, filtrable par chantier.

**Essais R&D internes (terre crue, fibres, biosourcés)** : organisés par
**Formulation / Campagne** plutôt que par chantier, enchaînement d'essais sur
une même série (granulométrie NF EN 933-1, VBS NF P94-068, teneur en eau,
compression, retrait, conductivité thermique NF EN 12667), sans échéance
normée. Écran clé : vue comparative de plusieurs formulations.

## Reporté en V2+

Accréditation COFRAC et portée formelle, import automatique des mesures depuis
les presses et balances, double signature de validation, incertitude élargie
automatisée, facturation d'essais pour des tiers, non-conformités et actions
correctives formalisées, GED des certificats d'étalonnage.

## Cadre normatif retenu

- Béton durci : série EN 12390 (1 : géométrie ; 2 : fabrication et cure ;
  3 : compression ; 5 : flexion).
- Terre crue : XP P13-901 (2022, blocs de terre crue), essais de sols
  détournés (NF EN ISO 17892-4, NF P94-068), pas de DTU dédié : le champ
  protocole libre est structurel, pas un contournement.
- Biosourcés : seules les Règles professionnelles du béton de chanvre font
  référence (liste verte C2P) ; le reste relève d'ATEx au cas par cas.
  Catalogue d'essais type : CODEM/Batlab (thermique, mécanique, hydrique,
  physique).

## Sources principales

Senaite (senaite.com, github.com/senaite/senaite.core) ; EN 12390 (Cerib,
AFNOR) ; terre crue (CRAterre craterre.hypotheses.org/6519, geomaterio.fr,
guide FFB) ; biosourcés (Cerema Biosourçons n°25-26, batlab.fr/essais) ;
rapports d'essais (ISO/IEC 17025:2017 § 7.8) ; flux éprouvettes chantier
(e-beton.io, concretedispatch.eu).
