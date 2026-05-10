"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";

const ligneSchema = z.object({
  designation: z.string().min(1),
  quantite: z.coerce.number().positive(),
  prixUnitaire: z.coerce.number().nonnegative(),
});

const commandeSchema = z.object({
  chantierId: z.string().min(1, "Chantier requis"),
  fournisseur: z.string().min(1, "Fournisseur requis"),
  reference: z.string().optional().or(z.literal("")),
  dateCommande: z.string().min(1),
  dateLivraisonPrevue: z.string().optional().or(z.literal("")),
  statut: z.enum(["COMMANDEE", "EN_LIVRAISON", "LIVREE", "ANNULEE"]),
  mode: z.enum(["ESPECES", "VIREMENT"]),
  note: z.string().optional().or(z.literal("")),
});

function extractLignes(formData: FormData) {
  const lignes: { designation: string; quantite: number; prixUnitaire: number; total: number }[] = [];
  // Lignes have keys lignes[i].designation, lignes[i].quantite, lignes[i].prixUnitaire
  const indexes = new Set<number>();
  for (const key of formData.keys()) {
    const m = key.match(/^lignes\[(\d+)\]\./);
    if (m) indexes.add(parseInt(m[1], 10));
  }
  for (const i of Array.from(indexes).sort((a, b) => a - b)) {
    const designation = String(formData.get(`lignes[${i}].designation`) ?? "").trim();
    const quantiteRaw = formData.get(`lignes[${i}].quantite`);
    const prixRaw = formData.get(`lignes[${i}].prixUnitaire`);
    if (!designation) continue;
    const parsed = ligneSchema.safeParse({
      designation,
      quantite: quantiteRaw,
      prixUnitaire: prixRaw,
    });
    if (parsed.success) {
      lignes.push({
        ...parsed.data,
        total: parsed.data.quantite * parsed.data.prixUnitaire,
      });
    }
  }
  return lignes;
}

function parseCommande(formData: FormData) {
  const data = commandeSchema.parse({
    chantierId: formData.get("chantierId"),
    fournisseur: formData.get("fournisseur"),
    reference: formData.get("reference"),
    dateCommande: formData.get("dateCommande"),
    dateLivraisonPrevue: formData.get("dateLivraisonPrevue"),
    statut: formData.get("statut") || "COMMANDEE",
    mode: formData.get("mode") || "VIREMENT",
    note: formData.get("note"),
  });
  return {
    chantierId: data.chantierId,
    fournisseur: data.fournisseur,
    reference: data.reference || null,
    dateCommande: new Date(data.dateCommande),
    dateLivraisonPrevue: data.dateLivraisonPrevue ? new Date(data.dateLivraisonPrevue) : null,
    statut: data.statut,
    mode: data.mode,
    note: data.note || null,
  };
}

export async function createCommande(formData: FormData) {
  const data = parseCommande(formData);
  const lignes = extractLignes(formData);
  if (lignes.length === 0) throw new Error("Au moins une ligne de commande est requise");

  const coutTotal = lignes.reduce((s, l) => s + l.total, 0);

  const created = await db.commande.create({
    data: {
      ...data,
      coutTotal,
      lignes: { create: lignes },
    },
  });

  // Si la commande a été créée depuis une demande de matériel, on lie
  // la demande à cette commande et on la marque COMMANDEE.
  const demandeId = formData.get("demandeId");
  if (typeof demandeId === "string" && demandeId.length > 0) {
    try {
      await db.demandeMateriel.update({
        where: { id: demandeId },
        data: {
          statut: "COMMANDEE",
          commandeId: created.id,
        },
      });
      revalidatePath("/demandes");
      revalidatePath(`/demandes/${demandeId}`);
    } catch (e) {
      // Ne bloque pas la création si le lien échoue
      console.error("Failed to link demande:", e);
    }
  }

  revalidatePath("/commandes");
  revalidatePath(`/chantiers/${data.chantierId}`);
  redirect(`/commandes/${created.id}`);
}

export async function updateCommande(id: string, formData: FormData) {
  const data = parseCommande(formData);
  const lignes = extractLignes(formData);
  if (lignes.length === 0) throw new Error("Au moins une ligne de commande est requise");

  const coutTotal = lignes.reduce((s, l) => s + l.total, 0);

  const existing = await db.commande.findUnique({ where: { id } });

  await db.$transaction([
    db.ligneCommande.deleteMany({ where: { commandeId: id } }),
    db.commande.update({
      where: { id },
      data: {
        ...data,
        coutTotal,
        lignes: { create: lignes },
      },
    }),
  ]);

  revalidatePath("/commandes");
  revalidatePath(`/commandes/${id}`);
  revalidatePath(`/chantiers/${data.chantierId}`);
  if (existing?.chantierId && existing.chantierId !== data.chantierId) {
    revalidatePath(`/chantiers/${existing.chantierId}`);
  }
}

type StatutCommande = "COMMANDEE" | "EN_LIVRAISON" | "LIVREE" | "ANNULEE";

export async function changerStatutCommande(
  id: string,
  statut: StatutCommande,
  dateLivraisonReelle?: Date
) {
  const data: { statut: StatutCommande; dateLivraisonReelle?: Date } = { statut };
  if (statut === "LIVREE" && !dateLivraisonReelle) {
    data.dateLivraisonReelle = new Date();
  } else if (dateLivraisonReelle) {
    data.dateLivraisonReelle = dateLivraisonReelle;
  }
  const cmd = await db.commande.update({ where: { id }, data });
  revalidatePath("/commandes");
  revalidatePath(`/commandes/${id}`);
  revalidatePath(`/chantiers/${cmd.chantierId}`);
}

export async function deleteCommande(id: string) {
  const existing = await db.commande.findUnique({ where: { id } });
  await db.commande.delete({ where: { id } });
  revalidatePath("/commandes");
  if (existing) revalidatePath(`/chantiers/${existing.chantierId}`);
  redirect("/commandes");
}
