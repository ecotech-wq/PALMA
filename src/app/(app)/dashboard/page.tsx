import { redirect } from "next/navigation";

// L'ancien tableau de bord est retiré de la navigation : la route est
// conservée en simple redirection pour ne casser aucun lien (favoris,
// raccourci PWA, notifications anciennes). Le cockpit « Statistiques »
// réservé à l'admin viendra dans un lot ultérieur ; les composants
// voisins (TodayWidget, MurDuTerrain, AnneauAvancement, QuickActionsBar)
// sont gardés pour lui.
export default function DashboardPage() {
  redirect("/aujourdhui");
}
