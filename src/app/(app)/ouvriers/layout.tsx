import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth-helpers";
import { MODULES } from "@/lib/espaces-client";

/**
 * Layout-level guard pour /ouvriers/* : l'annuaire (téléphones, contrats)
 * est réservé au pilotage, ADMIN + CONDUCTEUR (prédicat canPilot, matrice
 * 2026-07-17). Le tarif, lui, est admin seul et n'est jamais sérialisé
 * pour les autres rôles (gardes dans les pages). Les CHEF utilisent
 * /pointage pour saisir les présences.
 * Socle espaces : l'annuaire appartient au module "chantier" ; un espace
 * BE pur n'y accède pas, même par URL directe.
 */
export default async function OuvriersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await requireAuth();
  if (!me.canPilot) redirect("/aujourdhui");
  if (!me.modules.includes(MODULES.chantier)) redirect("/aujourdhui");
  return <>{children}</>;
}
