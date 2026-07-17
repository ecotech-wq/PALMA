import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth-helpers";
import { MODULES } from "@/lib/espaces-client";

/**
 * Layout-level guard pour /paie/* : seuls les ADMIN peuvent voir
 * (salaires, avances, retenues outils, etc.). Les CONDUCTEUR et CHEF
 * sont redirigés vers le tableau de bord.
 * Socle espaces : la paie est une donnée du module "chantier" ; dans un
 * espace BE pur, la page n'existe pas, même par URL directe.
 */
export default async function PaieLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await requireAuth();
  if (!me.canSeePaie) redirect("/aujourdhui");
  if (!me.modules.includes(MODULES.chantier)) redirect("/aujourdhui");
  return <>{children}</>;
}
