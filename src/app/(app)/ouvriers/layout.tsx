import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth-helpers";
import { MODULES } from "@/lib/espaces-client";

/**
 * Layout-level guard pour /ouvriers/* : la fiche ouvrier expose le
 * tarif, le type de contrat, les avances et l'historique de paie.
 * Seuls ADMIN et CONDUCTEUR peuvent y accéder. Les CHEF utilisent
 * /pointage pour saisir les présences sans voir les tarifs.
 * Socle espaces : l'annuaire appartient au module "chantier" ; un espace
 * BE pur n'y accède pas, même par URL directe.
 */
export default async function OuvriersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await requireAuth();
  if (!me.canSeePrices) redirect("/dashboard");
  if (!me.modules.includes(MODULES.chantier)) redirect("/dashboard");
  return <>{children}</>;
}
