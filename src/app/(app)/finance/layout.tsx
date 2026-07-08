import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth-helpers";

/**
 * Garde du module Suivi financier : pilotage réservé ADMIN + CONDUCTEUR
 * (les montants et le cockpit trésorerie ne sont pas visibles du CHEF ni du
 * CLIENT). La vue CLIENT de ses propres devis/situations est un lot ultérieur,
 * exposée ailleurs (tableau de bord client), pas ici.
 */
export default async function FinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await requireAuth();
  if (!me.canPilot) redirect("/dashboard");
  return <>{children}</>;
}
