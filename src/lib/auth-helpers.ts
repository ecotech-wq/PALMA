import "server-only";
import { auth } from "@/auth";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "CHEF";
  isAdmin: boolean;
};

/**
 * Récupère l'utilisateur connecté avec un flag `isAdmin` pratique pour
 * conditionner les vues. Lève si non authentifié.
 */
export async function requireAuth(): Promise<CurrentUser> {
  const session = await auth();
  if (!session?.user) throw new Error("Non authentifié");
  const role = session.user.role === "ADMIN" ? "ADMIN" : "CHEF";
  return {
    id: session.user.id as string,
    name: session.user.name as string,
    email: session.user.email as string,
    role,
    isAdmin: role === "ADMIN",
  };
}

/**
 * À utiliser au début d'une server action sensible (paie, paramètres,
 * gestion users, modifs financières). Lève si l'utilisateur n'est pas
 * admin — la mention apparaît côté client via le toast d'erreur.
 */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireAuth();
  if (!user.isAdmin) {
    throw new Error("Action réservée aux administrateurs");
  }
  return user;
}
