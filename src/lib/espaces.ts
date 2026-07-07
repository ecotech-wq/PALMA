import "server-only";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import type { Role } from "@/lib/auth-helpers";

// ─── Socle plateforme : contexte d'espace (arbitrage du 2026-07-07) ─────────
// Une entreprise = un espace (modèle Odoo : une app, une base, un sélecteur
// d'entreprise, des modules activables). L'espace COURANT vit dans un cookie ;
// « tous » consolide les espaces de l'utilisateur avec les droits les plus
// restrictifs (aucun privilège d'un espace ne déborde sur un autre).

export {
  COOKIE_ESPACE,
  TOUS_ESPACES,
  MODULES,
  type ModuleCode,
} from "@/lib/espaces-client";
import { COOKIE_ESPACE, TOUS_ESPACES, MODULES } from "@/lib/espaces-client";

export type EspaceResume = {
  id: string;
  nom: string;
  slug: string;
  couleur: string | null;
  modules: string[];
  role: Role;
};

export type ContexteEspaces = {
  /** Les espaces dont l'utilisateur est membre (rôle par espace). */
  espaces: EspaceResume[];
  /** Espace courant, ou null en mode « tous » (ou sans adhésion : hérité). */
  courant: EspaceResume | null;
  /** Ids servant à borner les requêtes ; null = pas de bornage (hérité). */
  espaceIds: string[] | null;
  /** Rôle effectif : celui de l'espace courant ; en « tous », le plus
   *  restrictif des adhésions ; sans adhésion, le rôle global (hérité). */
  roleEffectif: Role | null;
  /** Modules visibles : ceux de l'espace courant, ou l'union en « tous ». */
  modules: string[];
};

/** Privilège décroissant : sert au calcul « le plus restrictif ». */
const RANG: Record<Role, number> = {
  ADMIN: 5,
  CONDUCTEUR: 4,
  CHEF: 3,
  OUVRIER: 2,
  SOUS_TRAITANT: 1,
  CLIENT: 0,
};

export async function chargerContexteEspaces(
  userId: string
): Promise<ContexteEspaces> {
  const adhesions = await db.espaceMembre.findMany({
    where: { userId },
    include: { espace: true },
    orderBy: { espace: { nom: "asc" } },
  });

  const espaces: EspaceResume[] = adhesions.map((a) => ({
    id: a.espace.id,
    nom: a.espace.nom,
    slug: a.espace.slug,
    couleur: a.espace.couleur,
    modules: a.espace.modules,
    role: a.role as Role,
  }));

  // Sans adhésion : DENY par défaut (arbitrage sécurité 2026-07-07). Un
  // utilisateur sans espace ne voit aucun module et aucun projet (espaceIds
  // vide borne à néant), au lieu de « voit tout ». Les nouveaux comptes
  // reçoivent une adhésion à l'approbation / à l'ajout sur un projet.
  if (espaces.length === 0) {
    return {
      espaces: [],
      courant: null,
      espaceIds: [],
      roleEffectif: null,
      modules: [],
    };
  }

  const jar = await cookies();
  const voulu = jar.get(COOKIE_ESPACE)?.value;

  if (voulu === TOUS_ESPACES && espaces.length > 1) {
    // Mode consolidé : union des modules, droits les plus restrictifs.
    const plusRestrictif = espaces.reduce((min, e) =>
      RANG[e.role] < RANG[min.role] ? e : min
    );
    return {
      espaces,
      courant: null,
      espaceIds: espaces.map((e) => e.id),
      roleEffectif: plusRestrictif.role,
      modules: [...new Set(espaces.flatMap((e) => e.modules))],
    };
  }

  const courant =
    espaces.find((e) => e.id === voulu) ?? espaces[0];
  return {
    espaces,
    courant,
    espaceIds: [courant.id],
    roleEffectif: courant.role,
    modules: courant.modules,
  };
}
