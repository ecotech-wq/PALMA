// ─── Procédures (pipelines) d'affaires : logique PURE ───────────────────────
// Aucune dépendance serveur ni client Prisma généré : testée dans
// pipelines.test.ts. Depuis le 2026-07-18, les pipelines ne sont plus des
// constantes mais des DONNÉES par entreprise (modèle PipelineAffaire) que
// l'utilisateur modifie librement (ajouter, renommer, réordonner, supprimer
// des étapes et des procédures entières). Les 4 pipelines historiques
// restent ici comme MODELES_PAR_DEFAUT : ce sont les suggestions posées à
// la création d'un espace (backfill SQL + seed paresseux), plus une vérité.
//
// Les clés d'étape restent STABLES (stockées dans Affaire.etapeCle) : on
// renomme un libellé sans toucher sa clé, et une clé disparue s'affiche
// telle quelle (donnée historique : on affiche, on ne casse pas).

/** Une étape d'un pipeline : { cle stable, libellé affichable }. */
export interface EtapePipeline {
  cle: string;
  libelle: string;
}

/** Une pièce du modèle de checklist (copiée aux futures affaires). */
export interface PieceModele {
  cle: string;
  libelle: string;
}

/** Ce que les helpers ont besoin de connaître d'un pipeline chargé de la
 *  base (les champs Json arrivent bruts, on les relit avec tolérance). */
export interface PipelineComme {
  libelle: string;
  etapes: unknown;
}

/* -------------------------------------------------------------------------
 *  Palette : le SEUL endroit où vivent les accents de procédure.
 *
 *  Huit accents sobres nommés, définis pour le thème clair ET sombre par
 *  des classes Tailwind (jamais un hex dispersé dans les écrans). La base
 *  ne stocke que la clé (« ambre », « cuivre »...) ; changer un accent se
 *  fait ici, une fois, pour toute l'application.
 * ----------------------------------------------------------------------- */

export const COULEURS_PIPELINE = [
  "ambre",
  "bleu-acier",
  "vert-mousse",
  "ardoise",
  "cuivre",
  "violet-gris",
  "sable",
  "brique",
] as const;

export type CouleurPipeline = (typeof COULEURS_PIPELINE)[number];

export interface AccentPipeline {
  libelle: string;
  /** Pastille pleine (point de couleur des onglets, cartes, listes). */
  pastille: string;
  /** Texte accentué (libellé d'onglet actif, compteurs). */
  texte: string;
  /** Bordure accentuée (soulignement de l'onglet actif). */
  bordure: string;
}

export const PALETTE_PIPELINE: Record<CouleurPipeline, AccentPipeline> = {
  ambre: {
    libelle: "Ambre",
    pastille: "bg-amber-500 dark:bg-amber-400",
    texte: "text-amber-700 dark:text-amber-400",
    bordure: "border-amber-500 dark:border-amber-400",
  },
  "bleu-acier": {
    libelle: "Bleu acier",
    pastille: "bg-sky-700 dark:bg-sky-400",
    texte: "text-sky-700 dark:text-sky-400",
    bordure: "border-sky-700 dark:border-sky-400",
  },
  "vert-mousse": {
    libelle: "Vert mousse",
    pastille: "bg-emerald-600 dark:bg-emerald-400",
    texte: "text-emerald-700 dark:text-emerald-400",
    bordure: "border-emerald-600 dark:border-emerald-400",
  },
  ardoise: {
    libelle: "Ardoise",
    pastille: "bg-slate-500 dark:bg-slate-400",
    texte: "text-slate-600 dark:text-slate-300",
    bordure: "border-slate-500 dark:border-slate-400",
  },
  cuivre: {
    libelle: "Cuivre",
    pastille: "bg-orange-700 dark:bg-orange-400",
    texte: "text-orange-800 dark:text-orange-400",
    bordure: "border-orange-700 dark:border-orange-400",
  },
  "violet-gris": {
    libelle: "Violet gris",
    pastille: "bg-violet-500 dark:bg-violet-400",
    texte: "text-violet-700 dark:text-violet-400",
    bordure: "border-violet-500 dark:border-violet-400",
  },
  sable: {
    libelle: "Sable",
    pastille: "bg-stone-500 dark:bg-stone-400",
    texte: "text-stone-600 dark:text-stone-400",
    bordure: "border-stone-500 dark:border-stone-400",
  },
  brique: {
    libelle: "Brique",
    pastille: "bg-rose-700 dark:bg-rose-400",
    texte: "text-rose-700 dark:text-rose-400",
    bordure: "border-rose-700 dark:border-rose-400",
  },
};

/** La couleur stockée est-elle une clé de la palette ? */
export function estCouleurPipeline(v: string): v is CouleurPipeline {
  return (COULEURS_PIPELINE as readonly string[]).includes(v);
}

/** Accent d'une clé de couleur, avec repli sobre (donnée historique ou
 *  palette resserrée : on affiche en ardoise, on ne casse pas). */
export function accentPipeline(couleur: string): AccentPipeline {
  return estCouleurPipeline(couleur)
    ? PALETTE_PIPELINE[couleur]
    : PALETTE_PIPELINE["ardoise"];
}

/* -------------------------------------------------------------------------
 *  Modèles par défaut : les 4 pipelines historiques, devenus suggestions.
 *  Clés = valeurs de l'enum TypologieAffaire (compat du backfill SQL).
 * ----------------------------------------------------------------------- */

export interface ModelePipeline {
  cle: string;
  libelle: string;
  couleur: CouleurPipeline;
  etapes: EtapePipeline[];
  checklistModele: PieceModele[];
}

export const MODELES_PAR_DEFAUT: ModelePipeline[] = [
  {
    cle: "PERMIS_CONSTRUIRE",
    libelle: "Permis de construire",
    couleur: "ambre",
    etapes: [
      { cle: "contact", libelle: "Prise de contact" },
      { cle: "qualification", libelle: "Qualification" },
      { cle: "visite", libelle: "Visite et relevé" },
      { cle: "pieces", libelle: "Pièces client" },
      { cle: "conception", libelle: "Conception" },
      { cle: "devis", libelle: "Devis envoyé" },
      { cle: "dossier", libelle: "Dossier en cours" },
      { cle: "depose", libelle: "Déposé en mairie" },
      { cle: "instruction", libelle: "Instruction" },
    ],
    checklistModele: [
      { cle: "cadastre", libelle: "Plan cadastral" },
      { cle: "geometre", libelle: "Plan de géomètre" },
      { cle: "topo", libelle: "Relevé topographique" },
      { cle: "cu", libelle: "Certificat d'urbanisme" },
      { cle: "photos", libelle: "Photos du site" },
    ],
  },
  {
    cle: "ETUDE_STRUCTURE",
    libelle: "Étude structure",
    couleur: "bleu-acier",
    etapes: [
      { cle: "contact", libelle: "Prise de contact" },
      { cle: "qualification", libelle: "Qualification" },
      { cle: "pieces", libelle: "Pièces reçues" },
      { cle: "devis", libelle: "Devis d'honoraires" },
      { cle: "accepte", libelle: "Accepté" },
      { cle: "etude", libelle: "Étude en cours" },
      { cle: "livree", libelle: "Livrée" },
    ],
    checklistModele: [],
  },
  {
    cle: "TRAVAUX",
    libelle: "Travaux",
    couleur: "cuivre",
    etapes: [
      { cle: "contact", libelle: "Prise de contact" },
      { cle: "qualification", libelle: "Qualification" },
      { cle: "visite", libelle: "Visite de site" },
      { cle: "devis", libelle: "Métré et devis" },
      { cle: "negociation", libelle: "Négociation" },
      { cle: "signe", libelle: "Marché signé" },
    ],
    checklistModele: [],
  },
  {
    cle: "LABO",
    libelle: "Labo",
    couleur: "vert-mousse",
    etapes: [
      { cle: "demande", libelle: "Demande" },
      { cle: "devis", libelle: "Devis" },
      { cle: "echantillons", libelle: "Échantillons reçus" },
      { cle: "essais", libelle: "Essais en cours" },
      { cle: "rapport", libelle: "Rapport livré" },
    ],
    checklistModele: [],
  },
];

/** Modèle par défaut d'une clé (typologie historique), ou null. */
export function modeleParDefaut(cle: string): ModelePipeline | null {
  return MODELES_PAR_DEFAUT.find((m) => m.cle === cle) ?? null;
}

/** Étapes de repli pour une affaire SANS pipeline (donnée antérieure au
 *  backfill) : le modèle par défaut de sa typologie, sinon rien. */
export function etapesParDefautDeTypologie(typologie: string): EtapePipeline[] {
  return modeleParDefaut(typologie)?.etapes ?? [];
}

/* -------------------------------------------------------------------------
 *  Lecture tolérante des Json de la base
 * ----------------------------------------------------------------------- */

/** Relit un tableau Json [{ cle, libelle }] en ignorant l'inattendu. */
export function parseEtapes(raw: unknown): EtapePipeline[] {
  if (!Array.isArray(raw)) return [];
  const items: EtapePipeline[] = [];
  for (const it of raw) {
    if (
      it &&
      typeof it === "object" &&
      typeof (it as { cle?: unknown }).cle === "string" &&
      (it as { cle: string }).cle !== "" &&
      typeof (it as { libelle?: unknown }).libelle === "string"
    ) {
      items.push({
        cle: (it as { cle: string }).cle,
        libelle: (it as { libelle: string }).libelle,
      });
    }
  }
  return items;
}

/** Même forme que les étapes : { cle, libelle }. */
export function parseChecklistModele(raw: unknown): PieceModele[] {
  return parseEtapes(raw);
}

/* -------------------------------------------------------------------------
 *  Helpers d'affichage (remplaçants des anciens etapesDe / libelleEtape
 *  par typologie : ils prennent désormais le pipeline, objet ou étapes)
 * ----------------------------------------------------------------------- */

/** Étapes (ordonnées) d'un pipeline chargé de la base. */
export function etapesDe(pipeline: PipelineComme): EtapePipeline[] {
  return parseEtapes(pipeline.etapes);
}

/** Libellé d'une clé d'étape dans une liste d'étapes ; repli sur la clé
 *  (étape supprimée depuis : on affiche, on ne casse pas). */
export function libelleEtapeDe(etapes: EtapePipeline[], cle: string): string {
  return etapes.find((e) => e.cle === cle)?.libelle ?? cle;
}

/** Libellé d'une étape d'un pipeline chargé de la base. */
export function libelleEtape(pipeline: PipelineComme, cle: string): string {
  return libelleEtapeDe(etapesDe(pipeline), cle);
}

/** Checklist initiale d'une affaire née sur ce pipeline : le modèle,
 *  chaque pièce non faite. */
export function checklistInitiale(pipeline: {
  checklistModele: unknown;
}): { cle: string; libelle: string; fait: boolean }[] {
  return parseChecklistModele(pipeline.checklistModele).map((p) => ({
    cle: p.cle,
    libelle: p.libelle,
    fait: false,
  }));
}

/* -------------------------------------------------------------------------
 *  Clés et validation (créations et éditions de procédures)
 * ----------------------------------------------------------------------- */

export const LIBELLE_PIPELINE_MAX = 60;
export const LIBELLE_ETAPE_MAX = 60;

/** Clé slug tirée d'un libellé : minuscules, sans accents, les suites de
 *  caractères non alphanumériques deviennent un tiret (même règle que les
 *  dossiers personnalisés de la GED d'affaire). */
export function cleDepuisLibelle(libelle: string): string {
  return libelle
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Clé d'étape UNIQUE dans un pipeline : slug du libellé, suffixé -2, -3...
 *  en cas de collision (une clé n'est jamais recyclée à l'identique). */
export function cleEtapeUnique(
  libelle: string,
  existantes: { cle: string }[]
): string {
  const base = cleDepuisLibelle(libelle) || "etape";
  const prises = new Set(existantes.map((e) => e.cle));
  if (!prises.has(base)) return base;
  for (let i = 2; ; i++) {
    const cand = `${base}-${i}`;
    if (!prises.has(cand)) return cand;
  }
}

const CLE_SLUG = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/i;

/**
 * Valide une liste d'étapes (création ou remplacement) : au moins une
 * étape, clés slug uniques dans le pipeline, libellés de 1 à 60 caractères.
 * Renvoie null si tout va bien, sinon le message d'erreur (français,
 * affichable tel quel).
 */
export function validerEtapes(etapes: EtapePipeline[]): string | null {
  if (etapes.length === 0) {
    return "Une procédure doit garder au moins une étape";
  }
  const vues = new Set<string>();
  for (const e of etapes) {
    const libelle = e.libelle.trim();
    if (libelle.length === 0) {
      return "Chaque étape doit avoir un libellé";
    }
    if (libelle.length > LIBELLE_ETAPE_MAX) {
      return `Libellé d'étape trop long (${LIBELLE_ETAPE_MAX} caractères maximum)`;
    }
    if (!CLE_SLUG.test(e.cle)) {
      return "Clé d'étape invalide";
    }
    if (vues.has(e.cle)) {
      return "Deux étapes portent la même clé";
    }
    vues.add(e.cle);
  }
  return null;
}

/** Même règles pour le modèle de checklist, mais une liste vide est
 *  permise (toutes les procédures n'ont pas de pièces types). */
export function validerChecklistModele(pieces: PieceModele[]): string | null {
  if (pieces.length === 0) return null;
  const err = validerEtapes(pieces);
  return err === "Une procédure doit garder au moins une étape" ? null : err;
}
