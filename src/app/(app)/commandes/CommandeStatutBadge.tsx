import { Badge, type BadgeColor } from "@/components/ui/Badge";

const statutLabel: Record<string, string> = {
  COMMANDEE: "Commandée",
  EN_LIVRAISON: "En livraison",
  LIVREE: "Livrée",
  ANNULEE: "Annulée",
};

const statutColor: Record<string, BadgeColor> = {
  COMMANDEE: "yellow",
  EN_LIVRAISON: "blue",
  LIVREE: "green",
  ANNULEE: "red",
};

export function CommandeStatutBadge({ statut }: { statut: string }) {
  return <Badge color={statutColor[statut] ?? "slate"}>{statutLabel[statut] ?? statut}</Badge>;
}
