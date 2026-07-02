import "server-only";
import { db } from "@/lib/db";
import type { Role } from "@/generated/prisma/enums";

/* -------------------------------------------------------------------------
 *  Lectures des membres (server components et actions uniquement).
 * ----------------------------------------------------------------------- */

export type MembreChantier = {
  id: string;
  userId: string;
  nom: string;
  email: string;
  role: Role;
  createdAt: Date;
};

/** Membres d'un chantier, triés par rôle puis nom (pour l'UI équipe). */
export async function listChantierMembres(
  chantierId: string
): Promise<MembreChantier[]> {
  const rows = await db.chantierMembre.findMany({
    where: { chantierId },
    select: {
      id: true,
      userId: true,
      createdAt: true,
      user: { select: { name: true, email: true, role: true } },
    },
  });
  const poids: Record<string, number> = {
    ADMIN: 0,
    CONDUCTEUR: 1,
    CHEF: 2,
    OUVRIER: 3,
    SOUS_TRAITANT: 4,
    CLIENT: 5,
  };
  return rows
    .map((r) => ({
      id: r.id,
      userId: r.userId,
      nom: r.user.name,
      email: r.user.email,
      role: r.user.role,
      createdAt: r.createdAt,
    }))
    .sort(
      (a, b) =>
        (poids[a.role] ?? 9) - (poids[b.role] ?? 9) ||
        a.nom.localeCompare(b.nom, "fr")
    );
}

/** L'utilisateur est-il membre du chantier ? */
export async function isChantierMembre(
  userId: string,
  chantierId: string
): Promise<boolean> {
  const m = await db.chantierMembre.findUnique({
    where: { chantierId_userId: { chantierId, userId } },
    select: { id: true },
  });
  return m !== null;
}

/** Membres d'un canal (avec leur rôle, pour l'UI de gestion). */
export async function listCanalMembres(canalId: string) {
  const rows = await db.canalMembre.findMany({
    where: { canalId },
    select: {
      userId: true,
      createdAt: true,
      user: { select: { name: true, role: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    userId: r.userId,
    nom: r.user.name,
    role: r.user.role,
    createdAt: r.createdAt,
  }));
}

/**
 * Utilisateurs ACTIFS invitables sur un chantier (pas encore membres).
 * L'UI filtre ensuite par la borne dure selon le canal visé.
 */
export async function listUtilisateursInvitables(chantierId: string) {
  const membres = await db.chantierMembre.findMany({
    where: { chantierId },
    select: { userId: true },
  });
  const dejaMembres = membres.map((m) => m.userId);
  const users = await db.user.findMany({
    where: { status: "ACTIVE", id: { notIn: dejaMembres } },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });
  return users;
}
