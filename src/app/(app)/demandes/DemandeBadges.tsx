import { Badge } from "@/components/ui/Badge";

export const statutLabel: Record<string, string> = {
  DEMANDEE: "Demandée",
  APPROUVEE: "Approuvée",
  REFUSEE: "Refusée",
  COMMANDEE: "Commandée",
};

export function DemandeStatutBadge({ statut }: { statut: string }) {
  const map: Record<string, "yellow" | "blue" | "red" | "green"> = {
    DEMANDEE: "yellow",
    APPROUVEE: "blue",
    REFUSEE: "red",
    COMMANDEE: "green",
  };
  return <Badge color={map[statut] ?? "slate"}>{statutLabel[statut]}</Badge>;
}
