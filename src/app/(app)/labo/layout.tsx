import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth-helpers";

/**
 * Garde du module Laboratoire : pilotage réservé ADMIN + CONDUCTEUR (les
 * essais, formulations R&D et rapports ne sont visibles ni du CHEF ni du
 * CLIENT), même verrou que le suivi financier. La diffusion d'un rapport
 * d'essai au client est un lot ultérieur, exposée ailleurs, pas ici.
 */
export default async function LaboLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await requireAuth();
  if (!me.canPilot) redirect("/aujourdhui");
  return <>{children}</>;
}
