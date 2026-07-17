"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  requireAdmin,
  requireAdminOrConducteur,
  requireAuth,
  requireChantierManager,
  requireEspaceCourant,
  espaceFilter,
} from "@/lib/auth-helpers";
import { nombreProtege } from "@/lib/visibilite-guards";

const chantierSchema = z.object({
  nom: z.string().min(1, "Nom requis"),
  // Projets typés (VISION-LYNX-V4) : une étude BE est un Chantier de type
  // ETUDE. Le champ n'est proposé qu'à la création (figé ensuite).
  type: z.enum(["CHANTIER", "ETUDE"]).default("CHANTIER"),
  adresse: z.string().optional().or(z.literal("")),
  description: z.string().optional().or(z.literal("")),
  dateDebut: z.string().optional().or(z.literal("")),
  dateFin: z.string().optional().or(z.literal("")),
  statut: z.enum(["PLANIFIE", "EN_COURS", "PAUSE", "TERMINE", "ANNULE"]),
  chefId: z.string().optional().or(z.literal("")),
});

/**
 * Budgets : champs PROTÉGÉS (audit 2026-07-17). Le formulaire ne les émet
 * que pour les rôles autorisés (plus de hidden input à valeur réelle).
 * Absents du FormData ou appelant non autorisé -> undefined : Prisma
 * ignore la clé et la valeur existante en base est conservée.
 */
function parseChantier(formData: FormData, budgetsAutorises: boolean) {
  const data = chantierSchema.parse({
    nom: formData.get("nom"),
    type: formData.get("type") || "CHANTIER",
    adresse: formData.get("adresse"),
    description: formData.get("description"),
    dateDebut: formData.get("dateDebut"),
    dateFin: formData.get("dateFin"),
    statut: formData.get("statut") || "PLANIFIE",
    chefId: formData.get("chefId"),
  });

  return {
    nom: data.nom,
    type: data.type,
    adresse: data.adresse || null,
    description: data.description || null,
    dateDebut: data.dateDebut ? new Date(data.dateDebut) : null,
    dateFin: data.dateFin ? new Date(data.dateFin) : null,
    statut: data.statut,
    budgetEspeces: nombreProtege(budgetsAutorises, formData.get("budgetEspeces")),
    budgetVirement: nombreProtege(budgetsAutorises, formData.get("budgetVirement")),
    chefId: data.chefId || null,
  };
}

export async function createChantier(formData: FormData) {
  const me = await requireAdmin();
  const parsed = parseChantier(formData, me.canSeePrices);
  // À la création, un budget absent vaut 0 (défaut du schéma Prisma).
  const data = {
    ...parsed,
    budgetEspeces: parsed.budgetEspeces ?? 0,
    budgetVirement: parsed.budgetVirement ?? 0,
  };
  // Socle espaces : tout projet naît dans l'espace courant, dont le module
  // correspondant doit être actif (une étude naît dans un espace « be »).
  const espace = requireEspaceCourant(me);
  const moduleRequis = data.type === "ETUDE" ? "be" : "chantier";
  if (!espace.modules.includes(moduleRequis)) {
    throw new Error(
      `Le module « ${moduleRequis} » n'est pas actif dans l'espace ${espace.nom}`
    );
  }
  const created = await db.chantier.create({
    data: { ...data, espaceId: espace.id },
  });
  // Gabarit d'étude : canaux par défaut « conception » (interne) et
  // « client » (visible client), en plus du « Général » créé à la volée
  // par la messagerie. Un chantier garde son gabarit historique.
  if (data.type === "ETUDE") {
    await db.canal.createMany({
      data: [
        { chantierId: created.id, nom: "conception", visibility: "INTERNE", ordre: 1, createdById: me.id },
        { chantierId: created.id, nom: "client", visibility: "CLIENT", ordre: 2, createdById: me.id },
      ],
      skipDuplicates: true,
    });
    // Sans CanalMembre, un canal n'est visible que des admins : le créateur
    // rejoint d'office, les membres suivants sont ajoutés par
    // addChantierMembre (auto-adhésion aux canaux du gabarit d'étude).
    const canaux = await db.canal.findMany({
      where: { chantierId: created.id },
      select: { id: true },
    });
    await db.canalMembre.createMany({
      data: canaux.map((c) => ({ canalId: c.id, userId: me.id, addedById: me.id })),
      skipDuplicates: true,
    });
    revalidatePath("/be");
    redirect(`/be/${created.id}`);
  }
  revalidatePath("/chantiers");
  redirect(`/chantiers/${created.id}`);
}

export async function updateChantier(id: string, formData: FormData) {
  const me = await requireAuth();
  // Contre-vérification 2026-07-07 : sans cette garde, tout authentifié
  // (client compris) pouvait modifier n'importe quel chantier par POST forgé.
  await requireChantierManager(me, id);
  // Sécurité : seul ADMIN ou CONDUCTEUR peut modifier le budget. Pour les
  // autres, nombreProtege renvoie undefined même sur payload forgé et
  // Prisma ne touche pas aux colonnes (valeurs existantes conservées).
  const data = parseChantier(formData, me.canSeePrices);
  // Le type de projet est figé après création : on l'écarte de la mise à
  // jour (le formulaire d'édition ne l'envoie pas, et zod remettrait le
  // défaut CHANTIER, ce qui requalifierait silencieusement une étude).
  const { type: _type, ...sansType } = data;
  void _type;
  await db.chantier.update({ where: { id }, data: sansType });
  revalidatePath("/chantiers");
  revalidatePath(`/chantiers/${id}`);
}

export async function deleteChantier(id: string) {
  await requireAdmin();
  await db.chantier.delete({ where: { id } });
  revalidatePath("/chantiers");
  redirect("/chantiers");
}

/**
 * Archive un chantier (soft delete). Le chantier reste en base mais
 * disparaît des listes par défaut.
 */
export async function archiverChantier(id: string) {
  await requireAdmin();
  await db.chantier.update({
    where: { id },
    data: { archivedAt: new Date() },
  });
  revalidatePath("/chantiers");
  revalidatePath(`/chantiers/${id}`);
}

/** Réouvre un chantier archivé. */
export async function reouvrirChantier(id: string) {
  await requireAdmin();
  await db.chantier.update({
    where: { id },
    data: { archivedAt: null },
  });
  revalidatePath("/chantiers");
  revalidatePath(`/chantiers/${id}`);
}

export async function affecterEquipeAuChantier(equipeId: string, chantierId: string | null) {
  // Contre-vérification 2026-07-07 : action jusqu'ici sans AUCUNE garde.
  // Frontière d'espace : l'équipe ET le chantier cible doivent appartenir
  // à un espace de l'utilisateur (ids forgeables sinon).
  const me = await requireAdminOrConducteur();
  const equipe = await db.equipe.findFirst({
    where: { id: equipeId, ...espaceFilter(me) },
    select: { id: true },
  });
  if (!equipe) throw new Error("Équipe inconnue dans votre espace");
  if (chantierId) {
    const chantier = await db.chantier.findFirst({
      where: { id: chantierId, ...espaceFilter(me) },
      select: { id: true },
    });
    if (!chantier) throw new Error("Chantier inconnu dans votre espace");
  }
  await db.equipe.update({
    where: { id: equipeId },
    data: { chantierId: chantierId || null },
  });
  revalidatePath("/chantiers");
  if (chantierId) revalidatePath(`/chantiers/${chantierId}`);
  revalidatePath("/equipes");
}
