import { Badge, type BadgeColor } from "@/components/ui/Badge";

const statutLabel: Record<string, string> = {
  PLANIFIE: "Planifié",
  EN_COURS: "En cours",
  PAUSE: "En pause",
  TERMINE: "Terminé",
  ANNULE: "Annulé",
};

const statutColor: Record<string, BadgeColor> = {
  PLANIFIE: "slate",
  EN_COURS: "green",
  PAUSE: "yellow",
  TERMINE: "blue",
  ANNULE: "red",
};

export function ChantierStatutBadge({ statut }: { statut: string }) {
  return <Badge color={statutColor[statut] ?? "slate"}>{statutLabel[statut] ?? statut}</Badge>;
}
