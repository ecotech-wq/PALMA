// Couleur du point distinctif de chaque tag, partagée entre TagChip et
// TagPicker. Uniquement des tokens de la charte (définis dans globals.css),
// jamais de couleur en dur : changer la charte suffit à changer les pastilles.
import { normalizeTagCode } from "../core/parser";

const DOT_BY_CODE: Record<string, string> = {
  tache: "bg-brand-500",
  incident: "bg-accent-500",
  reserve: "bg-brand-300",
};

/** Classe Tailwind du point de couleur d'un tag (repli neutre pour un code inconnu). */
export function tagDotClass(code: string): string {
  return DOT_BY_CODE[normalizeTagCode(code)] ?? "bg-muted-foreground";
}
