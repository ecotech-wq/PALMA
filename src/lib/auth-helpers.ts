import "server-only";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export type ClientVisibility = {
  showJournal: boolean;
  showIncidents: boolean;
  showPlans: boolean;
  showRapportsHebdo: boolean;
};

export type Role = "ADMIN" | "CONDUCTEUR" | "CHEF" | "CLIENT";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  isAdmin: boolean;
  /** Conducteur de travaux : voit prix matériel / loc / cmd, fait OPC/OPR */
  isConducteur: boolean;
  /** Chef de chantier = ouvrier de terrain. Aucun prix visible. */
  isChef: boolean;
  isClient: boolean;
  /**
   * Peut voir les prix matériel / locations / commandes / budgets ?
   * → ADMIN et CONDUCTEUR uniquement. CHEF jamais.
   */
  canSeePrices: boolean;
  /**
   * Peut voir la paie complète (salaires, avances, retenues) ?
   * → ADMIN uniquement.
   */
  canSeePaie: boolean;
  /**
   * Peut piloter (créer chantiers, planning, OPC, valider demandes, etc.) ?
   * → ADMIN ou CONDUCTEUR.
   */
  canPilot: boolean;
  // Visibility uniquement utile côté CLIENT. Pour les autres, tout est true.
  visibility: ClientVisibility;
};

/**
 * Récupère l'utilisateur connecté avec des flags pratiques pour
 * conditionner les vues. Lève si non authentifié.
 */
export async function requireAuth(): Promise<CurrentUser> {
  const session = await auth();
  if (!session?.user) throw new Error("Non authentifié");
  const raw = session.user.role;
  const role: Role =
    raw === "ADMIN"
      ? "ADMIN"
      : raw === "CONDUCTEUR"
        ? "CONDUCTEUR"
        : raw === "CLIENT"
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

  const isAdmin = role === "ADMIN";
  const isConducteur = role === "CONDUCTEUR";
  const isChef = role === "CHEF";
  const isClient = role === "CLIENT";

  return {
    id: session.user.id as string,
    name: session.user.name as string,
    email: session.user.email as string,
    role,
    isAdmin,
    isConducteur,
    isChef,
    isClient,
    canSeePrices: isAdmin || isConducteur,
    canSeePaie: isAdmin,
    canPilot: isAdmin || isConducteur,
    visibility,
  };
}

/**
 * À utiliser au début d'une server action réservée aux admins (paie,
 * paramètres globaux, gestion users). Lève sinon.
 */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireAuth();
  if (!user.isAdmin) {
    throw new Error("Action réservée aux administrateurs");
  }
  return user;
}

/**
 * À utiliser au début d'une server action de pilotage : création/édition
 * de chantiers, planning, OPC, validation demandes, commandes, locations.
 * Autorise ADMIN + CONDUCTEUR. Refuse CHEF et CLIENT.
 */
export async function requireAdminOrConducteur(): Promise<CurrentUser> {
  const user = await requireAuth();
  if (!user.canPilot) {
    throw new Error(
      "Action réservée aux administrateurs et conducteurs de travaux"
    );
  }
  return user;
}

/**
 * Renvoie la liste des chantiers auxquels l'utilisateur peut accéder.
 * - ADMIN / CONDUCTEUR : tous les chantiers (null = pas de filtre)
 * - CHEF : tous les chantiers pour l'instant (à restreindre si besoin
 *   plus tard — il faudrait une table de mapping chantier ↔ chef)
 * - CLIENT : seulement ceux où il est rattaché en tant que client
 */
export async function getAccessibleChantierIds(
  user: CurrentUser
): Promise<string[] | null> {
  if (user.isAdmin || user.isConducteur || user.isChef) return null;
  const u = await db.user.findUnique({
    where: { id: user.id },
    select: { chantiersClient: { select: { id: true } } },
  });
  return (u?.chantiersClient ?? []).map((c) => c.id);
}

/**
 * Vérifie qu'un utilisateur peut accéder à un chantier précis.
 * Lève sinon. Pour ADMIN/CONDUCTEUR/CHEF : toujours true.
 */
export async function requireChantierAccess(
  user: CurrentUser,
  chantierId: string
): Promise<void> {
  if (user.isAdmin || user.isConducteur || user.isChef) return;
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
