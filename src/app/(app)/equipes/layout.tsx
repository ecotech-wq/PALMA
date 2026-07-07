import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth-helpers";
import { MODULES } from "@/lib/espaces-client";

/**
 * Layout-level guard pour /equipes/* : la gestion des équipes (création,
 * affectation, suppression) est une tâche de pilotage réservée ADMIN +
 * CONDUCTEUR, comme /ouvriers. Un CHEF n'y a pas accès (ses actions
 * lèveraient de toute façon). Module "chantier" requis.
 */
export default async function EquipesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await requireAuth();
  if (!me.canPilot) redirect("/dashboard");
  if (!me.modules.includes(MODULES.chantier)) redirect("/dashboard");
  return <>{children}</>;
}
