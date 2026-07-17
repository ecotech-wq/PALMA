#!/usr/bin/env node
/**
 * Rattrapage des miniatures de photos uploadées.
 *
 * Depuis cette version, saveUploadedPhoto écrit une miniature
 * `<uuid>.thumb.webp` (320 px, qualité 70) à côté de chaque photo. Ce
 * script génère les miniatures MANQUANTES pour tout l'existant : il
 * parcourt public/uploads (tous les sous-dossiers : journal, rapports,
 * materiel, ouvriers, logos, pv, plans, ...), et pour chaque `.webp` qui
 * n'est pas déjà une miniature, crée le `.thumb.webp` s'il n'existe pas.
 *
 * Idempotent : relançable autant de fois que nécessaire, il ne refait
 * jamais une miniature déjà présente et ne touche jamais aux originaux.
 * Les fichiers non-image (vidéos, PDF, documents) sont ignorés.
 *
 *   node scripts/generer-miniatures.mjs
 */
import { readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const RACINE = path.join(process.cwd(), "public", "uploads");
const SUFFIXE_MINIATURE = ".thumb.webp";
// Garde-fou : un webp d'upload fait au plus quelques Mo (photos 1280 px,
// plans 2560 px). Au-delà de 50 Mo, fichier aberrant : on n'y touche pas.
const TAILLE_MAX_OCTETS = 50 * 1024 * 1024;

const totaux = {
  creees: 0,
  dejaPresentes: 0,
  miniaturesExistantes: 0,
  nonImages: 0,
  tropGros: 0,
  erreurs: 0,
};
/** Comptes par dossier de premier niveau (journal, rapports, ...). */
const parDossier = new Map();

function compte(dossier, cle) {
  totaux[cle] += 1;
  if (!parDossier.has(dossier)) {
    parDossier.set(dossier, { creees: 0, dejaPresentes: 0 });
  }
  const d = parDossier.get(dossier);
  if (cle in d) d[cle] += 1;
}

async function parcourir(dir, dossier) {
  let entrees;
  try {
    entrees = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // dossier absent : rien à faire
  }
  for (const e of entrees) {
    const chemin = path.join(dir, e.name);
    if (e.isDirectory()) {
      await parcourir(chemin, dossier ?? e.name);
      continue;
    }
    if (!e.isFile()) continue;
    const nom = e.name.toLowerCase();
    if (nom.endsWith(SUFFIXE_MINIATURE)) {
      compte(dossier ?? ".", "miniaturesExistantes");
      continue;
    }
    if (!nom.endsWith(".webp")) {
      // vidéos, PDF, DWG, documents... : pas des photos à miniaturiser
      compte(dossier ?? ".", "nonImages");
      continue;
    }
    const cible = chemin.slice(0, -".webp".length) + SUFFIXE_MINIATURE;
    if (existsSync(cible)) {
      compte(dossier ?? ".", "dejaPresentes");
      continue;
    }
    try {
      const s = await stat(chemin);
      if (s.size > TAILLE_MAX_OCTETS) {
        compte(dossier ?? ".", "tropGros");
        console.warn(`Ignoré (trop gros, ${s.size} octets) : ${chemin}`);
        continue;
      }
      await sharp(chemin)
        .rotate()
        .resize(320, 320, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 70 })
        .toFile(cible);
      compte(dossier ?? ".", "creees");
    } catch (err) {
      compte(dossier ?? ".", "erreurs");
      console.error(`Erreur sur ${chemin} : ${err.message}`);
    }
  }
}

console.log(`Rattrapage des miniatures dans ${RACINE}`);
if (!existsSync(RACINE)) {
  console.log("Aucun dossier public/uploads : rien à faire.");
  process.exit(0);
}
await parcourir(RACINE, null);

console.log("\nJournal des comptes");
console.log(`  Miniatures créées      : ${totaux.creees}`);
console.log(`  Déjà présentes         : ${totaux.dejaPresentes}`);
console.log(`  Miniatures existantes  : ${totaux.miniaturesExistantes}`);
console.log(`  Non-images ignorés     : ${totaux.nonImages}`);
console.log(`  Trop gros (ignorés)    : ${totaux.tropGros}`);
console.log(`  Erreurs                : ${totaux.erreurs}`);
if (parDossier.size > 0) {
  console.log("\nPar dossier (créées / déjà présentes) :");
  for (const [dossier, d] of [...parDossier.entries()].sort()) {
    console.log(`  ${dossier} : ${d.creees} / ${d.dejaPresentes}`);
  }
}
process.exit(totaux.erreurs > 0 ? 1 : 0);
