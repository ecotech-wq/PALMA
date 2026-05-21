"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { audit } from "@/lib/audit";
import { deleteUploadedPhoto } from "@/lib/upload";

const RETENTION_DAYS = 30;

export type Entity = "tache" | "commande" | "rapport";

function olderThanRetention(d: Date): boolean {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  return d < cutoff;
}

/**
 * Restaure une entité depuis la corbeille (annule le soft-delete).
 * Si l'entité a dépassé la rétention, on refuse.
 */
export async function restoreItem(entity: Entity, id: string) {
  const me = await requireAdmin();
  if (entity === "tache") {
    const t = await db.tache.findUnique({ where: { id } });
    if (!t?.deletedAt) throw new Error("Tâche introuvable ou déjà restaurée");
    if (olderThanRetention(t.deletedAt)) {
      throw new Error("Au-delà de 30 jours, restauration impossible");
    }
    await db.tache.update({ where: { id }, data: { deletedAt: null } });
    await audit(
      { id: me.id, name: me.name, role: me.role },
      {
        action: "TRASH_RESTORED",
        entity: "Tache",
        entityId: id,
        summary: `Tâche restaurée depuis la corbeille : ${t.nom}`,
      }
    );
    revalidatePath("/planning");
    revalidatePath(`/chantiers/${t.chantierId}`);
  } else if (entity === "commande") {
    const c = await db.commande.findUnique({ where: { id } });
    if (!c?.deletedAt) throw new Error("Commande introuvable");
    if (olderThanRetention(c.deletedAt)) {
      throw new Error("Au-delà de 30 jours, restauration impossible");
    }
    await db.commande.update({ where: { id }, data: { deletedAt: null } });
    await audit(
      { id: me.id, name: me.name, role: me.role },
      {
        action: "TRASH_RESTORED",
        entity: "Commande",
        entityId: id,
        summary: `Commande restaurée : ${c.fournisseur}`,
      }
    );
    revalidatePath("/commandes");
    revalidatePath(`/chantiers/${c.chantierId}`);
  } else if (entity === "rapport") {
    const r = await db.rapportChantier.findUnique({ where: { id } });
    if (!r?.deletedAt) throw new Error("Rapport introuvable");
    if (olderThanRetention(r.deletedAt)) {
      throw new Error("Au-delà de 30 jours, restauration impossible");
    }
    await db.rapportChantier.update({
      where: { id },
      data: { deletedAt: null },
    });
    await audit(
      { id: me.id, name: me.name, role: me.role },
      {
        action: "TRASH_RESTORED",
        entity: "RapportChantier",
        entityId: id,
        summary: `Rapport restauré (${r.date.toISOString().slice(0, 10)})`,
      }
    );
    revalidatePath("/rapports");
    revalidatePath(`/chantiers/${r.chantierId}`);
  }
  revalidatePath("/admin/corbeille");
}

/**
 * Supprime définitivement une entité (purge manuelle). Irréversible.
 */
export async function purgeItem(entity: Entity, id: string) {
  const me = await requireAdmin();
  if (entity === "tache") {
    const t = await db.tache.findUnique({ where: { id } });
    if (!t) return;
    await db.tache.delete({ where: { id } });
    await audit(
      { id: me.id, name: me.name, role: me.role },
      {
        action: "TRASH_PURGED",
        entity: "Tache",
        entityId: id,
        summary: `Tâche purgée définitivement : ${t.nom}`,
      }
    );
  } else if (entity === "commande") {
    const c = await db.commande.findUnique({ where: { id } });
    if (!c) return;
    await db.commande.delete({ where: { id } });
    await audit(
      { id: me.id, name: me.name, role: me.role },
      {
        action: "TRASH_PURGED",
        entity: "Commande",
        entityId: id,
        summary: `Commande purgée définitivement : ${c.fournisseur}`,
      }
    );
  } else if (entity === "rapport") {
    const r = await db.rapportChantier.findUnique({ where: { id } });
    if (!r) return;
    // Cette fois on supprime aussi les photos sur disque
    for (const p of r.photos) await deleteUploadedPhoto(p);
    await db.rapportChantier.delete({ where: { id } });
    await audit(
      { id: me.id, name: me.name, role: me.role },
      {
        action: "TRASH_PURGED",
        entity: "RapportChantier",
        entityId: id,
        summary: `Rapport purgé définitivement`,
      }
    );
  }
  revalidatePath("/admin/corbeille");
}

/**
 * Purge automatique des éléments dépassant la rétention. Appelé au
 * chargement de la page corbeille (passe légère, indempotente).
 */
export async function autoPurgeExpired(): Promise<{ purged: number }> {
  await requireAdmin();
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  // Récupère d'abord les rapports pour nettoyer leurs photos
  const expiredRapports = await db.rapportChantier.findMany({
    where: { deletedAt: { lt: cutoff } },
    select: { id: true, photos: true },
  });
  for (const r of expiredRapports) {
    for (const p of r.photos) await deleteUploadedPhoto(p);
  }
  const [t, c, r] = await Promise.all([
    db.tache.deleteMany({ where: { deletedAt: { lt: cutoff } } }),
    db.commande.deleteMany({ where: { deletedAt: { lt: cutoff } } }),
    db.rapportChantier.deleteMany({
      where: { deletedAt: { lt: cutoff } },
    }),
  ]);
  return { purged: t.count + c.count + r.count };
}
