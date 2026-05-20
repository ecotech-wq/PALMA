import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth-helpers";

/**
 * Layout-level guard pour /ouvriers/* : la fiche ouvrier expose le
 * tarif, le type de contrat, les avances et l'historique de paie.
 * Seuls ADMIN et CONDUCTEUR peuvent y accéder. Les CHEF utilisent
 * /pointage pour saisir les présences sans voir les tarifs.
 */
export default async function OuvriersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await requireAuth();
  if (!me.canSeePrices) redirect("/dashboard");
  return <>{children}</>;
}
