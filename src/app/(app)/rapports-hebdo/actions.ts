"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  requireAuth,
  requireAdmin,
  requireChantierAccess,
} from "@/lib/auth-helpers";
import { notify } from "@/lib/notifications";

/** Renvoie le lundi UTC de la semaine contenant `d`. */
export function lundiDeLaSemaine(d: Date): Date {
  const day = d.getUTCDay();
  const offsetMon = day === 0 ? 6 : day - 1;
  const monday = new Date(d);
  monday.setUTCDate(monday.getUTCDate() - offsetMon);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

/**
 * Récupère ou crée le RapportHebdo pour un chantier × semaine.
 * Création paresseuse : pas de row tant que l'admin n'a pas commencé
 * à éditer.
 */
async function ensureHebdo(chantierId: string, semaineDebut: Date) {
  return db.rapportHebdo.upsert({
    where: {
      chantierId_semaineDebut: {
        chantierId,
        semaineDebut,
      },
    },
    update: {},
    create: { chantierId, semaineDebut },
  });
}

const updateSchema = z.object({
  texteIntro: z.string().optional().or(z.literal("")),
});

/** Édition de l'intro du rapport hebdo (admin). */
export async function updateRapportHebdoIntro(
  chantierId: string,
  semaineDebutISO: string,
  formData: FormData
) {
  await requireAdmin();
  const data = updateSchema.parse({
    texteIntro: formData.get("texteIntro") || "",
  });
  const semaineDebut = new Date(semaineDebutISO + "T00:00:00.000Z");
  await ensureHebdo(chantierId, semaineDebut);
  await db.rapportHebdo.update({
    where: {
      chantierId_semaineDebut: { chantierId, semaineDebut },
    },
    data: { texteIntro: data.texteIntro || null },
  });
  revalidatePath(`/chantiers/${chantierId}/rapport-hebdo`);
}

/** Bascule un message dans la liste hiddenMessageIds (admin). */
export async function toggleMessageIncluded(
  chantierId: string,
  semaineDebutISO: string,
  messageId: string
) {
  await requireAdmin();
  const semaineDebut = new Date(semaineDebutISO + "T00:00:00.000Z");
  const r = await ensureHebdo(chantierId, semaineDebut);
  const isHidden = r.hiddenMessageIds.includes(messageId);
  await db.rapportHebdo.update({
    where: {
      chantierId_semaineDebut: { chantierId, semaineDebut },
    },
    data: {
      hiddenMessageIds: isHidden
        ? r.hiddenMessageIds.filter((m) => m !== messageId)
        : [...r.hiddenMessageIds, messageId],
    },
  });
  revalidatePath(`/chantiers/${chantierId}/rapport-hebdo`);
}

/** Marque le rapport comme envoyé au client. Notifie les clients
 *  rattachés au chantier (chantier.clients). */
export async function envoyerRapportHebdoAuClient(
  chantierId: string,
  semaineDebutISO: string
) {
  await requireAdmin();
  const semaineDebut = new Date(semaineDebutISO + "T00:00:00.000Z");
  await ensureHebdo(chantierId, semaineDebut);

  await db.rapportHebdo.update({
    where: {
      chantierId_semaineDebut: { chantierId, semaineDebut },
    },
    data: {
      envoyeAuClient: true,
      envoyeLe: new Date(),
    },
  });

  // Notifier les clients du chantier
  const chantier = await db.chantier.findUnique({
    where: { id: chantierId },
    include: { clients: { select: { id: true } } },
  });
  if (chantier) {
    for (const c of chantier.clients) {
      await notify(
        c.id,
        "RAPPORT_CREE",
        `Rapport hebdo — ${chantier.nom}`,
        `Le rapport de la semaine du ${semaineDebutISO} est disponible.`,
        `/chantiers/${chantierId}/rapport-hebdo?w=${semaineDebutISO}`
      );
    }
  }

  revalidatePath(`/chantiers/${chantierId}/rapport-hebdo`);
}

/** Annule l'envoi (admin) — peut servir si on veut re-éditer. */
export async function annulerEnvoiRapportHebdo(
  chantierId: string,
  semaineDebutISO: string
) {
  await requireAdmin();
  const semaineDebut = new Date(semaineDebutISO + "T00:00:00.000Z");
  await db.rapportHebdo.update({
    where: {
      chantierId_semaineDebut: { chantierId, semaineDebut },
    },
    data: { envoyeAuClient: false, envoyeLe: null },
  });
  revalidatePath(`/chantiers/${chantierId}/rapport-hebdo`);
}

/** Helper consultation : récupère tout pour la page hebdo. */
export async function getHebdoData(chantierId: string, semaineDebut: Date) {
  const me = await requireAuth();
  await requireChantierAccess(me, chantierId);

  const semaineFin = new Date(semaineDebut);
  semaineFin.setUTCDate(semaineFin.getUTCDate() + 7);

  const [hebdo, messages, chantier] = await Promise.all([
    db.rapportHebdo.findUnique({
      where: {
        chantierId_semaineDebut: { chantierId, semaineDebut },
      },
    }),
    db.journalMessage.findMany({
      where: {
        chantierId,
        date: { gte: semaineDebut, lt: semaineFin },
      },
      include: {
        author: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.chantier.findUnique({
      where: { id: chantierId },
      select: { id: true, nom: true },
    }),
  ]);

  return { me, hebdo, messages, chantier };
}
