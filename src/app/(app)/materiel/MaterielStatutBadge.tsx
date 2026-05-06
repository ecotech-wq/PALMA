import { Badge, type BadgeColor } from "@/components/ui/Badge";

const statutLabel: Record<string, string> = {
  DISPO: "Disponible",
  SORTI: "Sorti",
  EN_LOCATION: "En location",
  HS: "Hors service",
  PERDU: "Perdu",
};

const statutColor: Record<string, BadgeColor> = {
  DISPO: "green",
  SORTI: "blue",
  EN_LOCATION: "purple",
  HS: "red",
  PERDU: "slate",
};

export function MaterielStatutBadge({ statut }: { statut: string }) {
  return <Badge color={statutColor[statut] ?? "slate"}>{statutLabel[statut] ?? statut}</Badge>;
}

export const possesseurLabel: Record<string, string> = {
  ENTREPRISE: "Entreprise",
  LOCATION: "Location",
  PRET: "Prêt",
};
