import "server-only";
import { db } from "@/lib/db";

/* -------------------------------------------------------------------------
 *  Audit log helper.
 *
 *  Utilisation côté server action :
 *
 *    import { audit } from "@/lib/audit";
 *    await audit(me, {
 *      action: "PAIEMENT_PAYE",
 *      entity: "Paiement",
 *      entityId: paiement.id,
 *      summary: `Paiement ${formatEuro(paiement.montantNet)} versé à ${ouvrier.nom}`,
 *    });
 *
 *  Silencieux en cas d'erreur — un audit qui échoue ne doit JAMAIS
 *  bloquer l'action métier.
 * ----------------------------------------------------------------------- */

export type AuditPayload = {
  action: string;
  entity: string;
  entityId?: string | null;
  summary: string;
  metadata?: Record<string, unknown> | null;
};

type Actor = {
  id: string;
  name: string;
  role: string;
};

export async function audit(actor: Actor, p: AuditPayload): Promise<void> {
  try {
    // Le payload metadata doit être sérialisable JSON ; on round-trip via
    // JSON.stringify pour purger d'éventuelles fonctions/symboles.
    const base = {
      userId: actor.id,
      userName: actor.name,
      userRole: actor.role,
      action: p.action,
      entity: p.entity,
      entityId: p.entityId ?? null,
      summary: p.summary,
    };
    if (p.metadata) {
      const safeMeta = JSON.parse(JSON.stringify(p.metadata));
      await db.auditEntry.create({
        data: { ...base, metadata: safeMeta },
      });
    } else {
      await db.auditEntry.create({ data: base });
    }
  } catch (e) {
    console.error("audit failed:", e);
  }
}
