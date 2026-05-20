import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth-helpers";

/**
 * Layout-level guard : seuls ADMIN et CONDUCTEUR peuvent voir/gérer
 * les locations / prêts (coûts journaliers, totaux). Les CHEF voient
 * uniquement les sorties/retours physiques de matériel.
 */
export default async function LocationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await requireAuth();
  if (!me.canPilot) redirect("/dashboard");
  return <>{children}</>;
}
