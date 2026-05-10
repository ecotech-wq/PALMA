import { Badge } from "@/components/ui/Badge";

export const categorieLabel: Record<string, string> = {
  MATERIEL_MANQUANT: "Matériel manquant",
  PANNE: "Panne",
  METEO: "Météo",
  RETARD_FOURNISSEUR: "Retard fournisseur",
  SECURITE: "Sécurité",
  ACCIDENT: "Accident",
  CONFLIT: "Conflit",
  AUTRE: "Autre",
};

export const graviteLabel: Record<string, string> = {
  INFO: "Info",
  ATTENTION: "Attention",
  URGENT: "Urgent",
};

export const statutLabel: Record<string, string> = {
  OUVERT: "Ouvert",
  EN_COURS: "En cours",
  RESOLU: "Résolu",
};

export function GraviteBadge({ gravite }: { gravite: string }) {
  const map: Record<string, "blue" | "yellow" | "red"> = {
    INFO: "blue",
    ATTENTION: "yellow",
    URGENT: "red",
  };
  return <Badge color={map[gravite] ?? "slate"}>{graviteLabel[gravite]}</Badge>;
}

export function StatutBadge({ statut }: { statut: string }) {
  const map: Record<string, "yellow" | "blue" | "green"> = {
    OUVERT: "yellow",
    EN_COURS: "blue",
    RESOLU: "green",
  };
  return <Badge color={map[statut] ?? "slate"}>{statutLabel[statut]}</Badge>;
}
