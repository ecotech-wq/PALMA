import "server-only";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export type ClientVisibility = {
  showJournal: boolean;
  showIncidents: boolean;
  showPlans: boolean;
  showRapportsHebdo: boolean;
};

export type Role =
  | "ADMIN"
  | "CONDUCTEUR"
  | "CHEF"
  | "CLIENT"
  | "OUVRIER"
  | "SOUS_TRAITANT";

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
    raw === "ADMIN" ||
    raw === "CONDUCTEUR" ||
    raw === "CLIENT" ||
    raw === "OUVRIER" ||
    raw === "SOUS_TRAITANT"
      ? raw
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
 * v4.3 : l'accès est porté par la table ChantierMembre.
 * - ADMIN : tous les chantiers (null = pas de filtre)
 * - tout autre rôle : les chantiers où il est membre
 * - CLIENT : union avec l'ancienne relation chantiersClient (double
 *   lecture le temps de la transition, l'admin écrit encore par elle)
 */
export async function getAccessibleChantierIds(
  user: CurrentUser
): Promise<string[] | null> {
  if (user.isAdmin) return null;
  const membres = await db.chantierMembre.findMany({
    where: { userId: user.id },
    select: { chantierId: true },
  });
  const ids = new Set(membres.map((m) => m.chantierId));
  if (user.isClient) {
    const u = await db.user.findUnique({
      where: { id: user.id },
      select: { chantiersClient: { select: { id: true } } },
    });
    for (const c of u?.chantiersClient ?? []) ids.add(c.id);
  }
  return [...ids];
}

/**
 * Vérifie qu'un utilisateur peut accéder à un chantier précis.
 * Lève sinon. v4.3 : ADMIN toujours ; les autres par leur adhésion
 * (ChantierMembre), les clients aussi par l'ancienne relation.
 */
export async function requireChantierAccess(
  user: CurrentUser,
  chantierId: string
): Promise<void> {
  if (user.isAdmin) return;
  const membre = await db.chantierMembre.findUnique({
    where: { chantierId_userId: { chantierId, userId: user.id } },
    select: { id: true },
  });
  if (membre) return;
  if (user.isClient) {
    const u = await db.user.findUnique({
      where: { id: user.id },
      select: {
        chantiersClient: { where: { id: chantierId }, select: { id: true } },
      },
    });
    if (u && u.chantiersClient.length > 0) return;
  }
  throw new Error("Accès refusé à ce chantier");
}

/**
 * Gestionnaire d'un chantier : ADMIN, ou CONDUCTEUR membre de CE
 * chantier. À utiliser pour les actions locales à un chantier (membres,
 * canaux, validations). Lève sinon.
 */
export async function requireChantierManager(
  user: CurrentUser,
  chantierId: string
): Promise<void> {
  if (user.isAdmin) return;
  if (user.isConducteur) {
    const membre = await db.chantierMembre.findUnique({
      where: { chantierId_userId: { chantierId, userId: user.id } },
      select: { id: true },
    });
    if (membre) return;
  }
  throw new Error(
    "Action réservée à l'administrateur ou au conducteur de ce chantier"
  );
}
