import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth-helpers";

/**
 * Layout-level guard pour /paie/* : seuls les ADMIN peuvent voir
 * (salaires, avances, retenues outils, etc.). Les CONDUCTEUR et CHEF
 * sont redirigés vers le tableau de bord.
 */
export default async function PaieLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await requireAuth();
  if (!me.canSeePaie) redirect("/dashboard");
  return <>{children}</>;
}
