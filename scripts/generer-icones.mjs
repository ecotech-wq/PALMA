/**
 * Génère toutes les icônes PWA et favicons depuis le logo LYNX.
 *
 * Règle de la charte (docs/CHARTE-LYNX.md, section logo) : l'icône d'app est
 * une tuile toujours encre #141414, monogramme centré à 62 %, losange
 * #E8A33D, aucune variante claire. Les icônes « maskable » sont plein cadre
 * (Android rogne lui-même en cercle ou en goutte) ; les icônes « any »
 * gardent la tuile arrondie. Usage : node scripts/generer-icones.mjs
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const SORTIE = path.join(process.cwd(), "public", "icons");

/* Géométrie du monogramme (viewBox 0 0 96 96, voir public/brand/lynx-mark.svg) */
const L_POINTS = "20,12 44,12 44,60 84,60 84,84 20,84";
const LOSANGE_POINTS = "62,24 74,12 86,24 74,36";

/** Tuile arrondie (icônes « any » : proportions du logo officiel). */
function svgTuile() {
  return `<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
  <rect width="96" height="96" rx="20" fill="#141414"/>
  <polygon points="${L_POINTS}" fill="#edeae4"/>
  <polygon points="${LOSANGE_POINTS}" fill="#e8a33d"/>
</svg>`;
}

/** Plein cadre, monogramme réduit et centré (maskable et pomme : le
 *  système applique son propre masque, le contenu doit rester dans la
 *  zone sûre centrale). */
function svgPleinCadre(echelle) {
  return `<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
  <rect width="96" height="96" fill="#141414"/>
  <g transform="translate(48 48) scale(${echelle}) translate(-48 -48)">
    <polygon points="${L_POINTS}" fill="#edeae4"/>
    <polygon points="${LOSANGE_POINTS}" fill="#e8a33d"/>
  </g>
</svg>`;
}

async function rendre(svg, taille, fichier) {
  await sharp(Buffer.from(svg), { density: 300 })
    .resize(taille, taille)
    .png()
    .toFile(path.join(SORTIE, fichier));
  console.log(`  ${fichier} (${taille}x${taille})`);
}

await mkdir(SORTIE, { recursive: true });
console.log("Icônes LYNX :");
await rendre(svgTuile(), 192, "icon-192.png");
await rendre(svgTuile(), 512, "icon-512.png");
await rendre(svgTuile(), 32, "favicon-32.png");
await rendre(svgTuile(), 16, "favicon-16.png");
/* Zone sûre maskable : cercle de 80 % du cadre ; monogramme à 62 %. */
await rendre(svgPleinCadre(0.62), 192, "icon-192-maskable.png");
await rendre(svgPleinCadre(0.62), 512, "icon-512-maskable.png");
/* iOS arrondit lui-même : plein cadre, monogramme un peu plus généreux. */
await rendre(svgPleinCadre(0.72), 180, "apple-touch-icon.png");
console.log("Terminé.");
