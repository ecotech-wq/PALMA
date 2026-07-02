import { cn } from "@/lib/utils";
import { getTagDefinition } from "../core/catalog";
import { tagDotClass } from "./tag-colors";

/**
 * Pastille sobre d'un tag : un point de couleur (token de la charte) et le
 * libellé du catalogue. Composant purement présentationnel, utilisable côté
 * serveur comme côté client. Un code inconnu du catalogue est affiché tel
 * quel avec un point neutre.
 */
export function TagChip({ code, className }: { code: string; className?: string }) {
  const definition = getTagDefinition(code);
  const libelle = definition ? definition.label : code;

  return (
    <span
      title={definition?.description}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border-default bg-card px-2 py-0.5 text-xs font-medium text-foreground",
        className
      )}
    >
      <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tagDotClass(code))} />
      {libelle}
    </span>
  );
}
