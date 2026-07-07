import "server-only";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  chargerContexteEspaces,
  type EspaceResume,
} from "@/lib/espaces";

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
  // ── Socle plateforme (2026-07-07) : contexte d'espace (entreprise) ──
  /** Espaces dont l'utilisateur est membre, avec son rôle PAR espace. */
  espaces: EspaceResume[];
  /** Espace courant (cookie), ou null en mode « tous » / sans adhésion. */
  espaceCourant: EspaceResume | null;
  /** Bornage des requêtes projets : null = pas de bornage (hérité). */
  espaceIds: string[] | null;
  /** Modules (apps) visibles dans ce contexte : "chantier", "be"... */
  modules: string[];
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

  // Socle plateforme : le rôle EFFECTIF est celui de l'espace courant
  // (une projeteuse peut être CHEF côté BE sans exister côté chantier).
  // En mode « tous », droits les plus restrictifs ; sans adhésion, rôle
  // global hérité (aucun verrouillage pendant la transition).
  const ctx = await chargerContexteEspaces(session.user.id as string);
  const roleEffectif: Role = ctx.roleEffectif ?? role;

  const isAdmin = roleEffectif === "ADMIN";
  const isConducteur = roleEffectif === "CONDUCTEUR";
  const isChef = roleEffectif === "CHEF";
  const isClient = roleEffectif === "CLIENT";

  return {
    id: session.user.id as string,
    name: session.user.name as string,
    email: session.user.email as string,
    role: roleEffectif,
    isAdmin,
    isConducteur,
    isChef,
    isClient,
    canSeePrices: isAdmin || isConducteur,
    canSeePaie: isAdmin,
    canPilot: isAdmin || isConducteur,
    visibility,
    espaces: ctx.espaces,
    espaceCourant: ctx.courant,
    espaceIds: ctx.espaceIds,
    modules: ctx.modules,
  };
}

/** Fragment Prisma pour borner les requêtes Chantier à l'espace courant
 *  (ou aux espaces de l'utilisateur en mode « tous »). */
export function chantierEspaceFilter(user: CurrentUser) {
  return user.espaceIds ? { espaceId: { in: user.espaceIds } } : {};
}

/** Exige un espace courant UNIQUE (créations) : en mode « tous », on ne
 *  sait pas dans quelle entreprise ranger le nouvel objet. */
export function requireEspaceCourant(user: CurrentUser): EspaceResume {
  if (!user.espaceCourant) {
    throw new Error(
      "Choisissez d'abord un espace (entreprise) dans le sélecteur"
    );
  }
  return user.espaceCourant;
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
