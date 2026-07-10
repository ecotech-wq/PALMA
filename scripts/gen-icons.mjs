/**
 * Génère les icônes PNG de la PWA depuis le logo LYNX (SVG).
 *   npx tsx scripts/gen-icons.mjs   (ou : node scripts/gen-icons.mjs)
 *
 * Sources : public/brand/lynx-icon.svg (coins arrondis, marque à 62 %) pour les
 * icônes « any » et le favicon ; public/brand/lynx-icon-maskable.svg (pleine,
 * marque resserrée) pour les icônes maskable. Idempotent : réécrit les fichiers.
 */
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const brand = join(root, "public", "brand");
const icons = join(root, "public", "icons");

const anySvg = await readFile(join(brand, "lynx-icon.svg"));
const maskSvg = await readFile(join(brand, "lynx-icon-maskable.svg"));

async function png(svg, size, out) {
  const buf = await sharp(svg, { density: 384 }).resize(size, size).png().toBuffer();
  await writeFile(join(icons, out), buf);
  console.log(`  ✓ ${out} (${size}px)`);
}

await png(anySvg, 192, "icon-192.png");
await png(anySvg, 512, "icon-512.png");
await png(maskSvg, 192, "icon-192-maskable.png");
await png(maskSvg, 512, "icon-512-maskable.png");
await png(anySvg, 180, "apple-touch-icon.png");
await png(anySvg, 32, "favicon-32.png");
await png(anySvg, 16, "favicon-16.png");
console.log("Icônes LYNX régénérées.");
