import "server-only";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export type ClientVisibility = {
  showJournal: boolean;
  showIncidents: boolean;
  showPlans: boolean;
  showRapportsHebdo: boolean;
};

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "CHEF" | "CLIENT";
  isAdmin: boolean;
  isChef: boolean;
  isClient: boolean;
  // Visibility uniquement utile côté CLIENT. Pour ADMIN/CHEF tout est true.
  visibility: ClientVisibility;
};

/**
 * Récupère l'utilisateur connecté avec des flags pratiques pour
 * conditionner les vues. Lève si non authentifié.
 */
export async function requireAuth(): Promise<CurrentUser> {
  const session = await auth();
  if (!session?.user) throw new Error("Non authentifié");
  const role =
    session.user.role === "ADMIN"
      ? "ADMIN"
      : session.user.role === "CLIENT"
        ? "CLIENT"
        : "CHEF";

  // Pour les clients on charge les flags depuis la DB (sinon defaults true)
  let visibility: ClientVisibility = {
    showJournal: true,
    showIncidents: true,
    showPlans: true,
    showRapportsHebdo: true,
  };
  if (role === "CLIENT") {
    const u = await db.user.findUnique({
      where: { id: session.user.id as string },
      select: {
        showJournal: true,
        showIncidents: true,
        showPlans: true,
        showRapportsHebdo: true,
      },
    });
    if (u) {
      visibility = {
        showJournal: u.showJournal,
        showIncidents: u.showIncidents,
        showPlans: u.showPlans,
        showRapportsHebdo: u.showRapportsHebdo,
      };
    }
  }

  return {
    id: session.user.id as string,
    name: session.user.name as string,
    email: session.user.email as string,
    role,
    isAdmin: role === "ADMIN",
    isChef: role === "CHEF",
    isClient: role === "CLIENT",
    visibility,
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

/**
 * Renvoie la liste des chantiers auxquels l'utilisateur peut accéder.
 * - ADMIN / CHEF : tous les chantiers
 * - CLIENT : seulement ceux où il est rattaché en tant que client
 *
 * Renvoie un tableau d'IDs ou null si "tous".
 */
export async function getAccessibleChantierIds(
  user: CurrentUser
): Promise<string[] | null> {
  if (user.isAdmin || user.isChef) return null;
  // CLIENT : on récupère les chantiers où il est associé
  const u = await db.user.findUnique({
    where: { id: user.id },
    select: { chantiersClient: { select: { id: true } } },
  });
  return (u?.chantiersClient ?? []).map((c) => c.id);
}

/**
 * Vérifie qu'un utilisateur peut accéder à un chantier précis.
 * Lève sinon. Pour ADMIN/CHEF : toujours true.
 */
export async function requireChantierAccess(
  user: CurrentUser,
  chantierId: string
): Promise<void> {
  if (user.isAdmin || user.isChef) return;
  const u = await db.user.findUnique({
    where: { id: user.id },
    select: {
      chantiersClient: {
        where: { id: chantierId },
        select: { id: true },
      },
    },
  });
  if (!u || u.chantiersClient.length === 0) {
    throw new Error("Accès refusé à ce chantier");
  }
}
