import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth-helpers";

/**
 * Layout-level guard : seuls ADMIN et CONDUCTEUR peuvent voir/gérer
 * les commandes (avec prix). Les CHEF demandent du matériel via le fil
 * du chantier — la conversion en commande se fait par le conducteur.
 */
export default async function CommandesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await requireAuth();
  if (!me.canPilot) redirect("/dashboard");
  return <>{children}</>;
}
