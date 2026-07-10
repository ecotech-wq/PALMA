"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { audit } from "@/lib/audit";
import { MODULES } from "@/lib/espaces-client";

// ─── Administration des entreprises (espaces) ────────────────────────────────
// Réservé au propriétaire de plateforme (requireAdmin = isGlobalAdmin). On règle
// le nom, la COULEUR d'accent (charte : « l'espace colore son coin » : avatar,
// pastille du sélecteur, entête de documents ; jamais un composant système) et
// les modules (apps) exposés par l'entreprise.

const espaceSchema = z.object({
  nom: z.string().min(1, "Nom requis").max(80),
  // Couleur d'accent au format hex court ou long, ou vide (= pas de couleur).
  couleur: z
    .string()
    .regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/, "Couleur invalide")
    .optional()
    .or(z.literal("")),
  modules: z.array(z.enum(["chantier", "be"])).default([]),
  // Identité pour l'entête des documents (coordonnées de l'entreprise).
  adresse: z.string().max(200).optional().or(z.literal("")),
  telephone: z.string().max(40).optional().or(z.literal("")),
  email: z.string().email("Email invalide").max(120).optional().or(z.literal("")),
  siret: z.string().max(40).optional().or(z.literal("")),
});

/**
 * Crée une entreprise (espace). Le créateur (admin global) en devient membre
 * ADMIN pour la voir immédiatement dans son sélecteur. Slug dérivé du nom,
 * unicité garantie par suffixe.
 */
export async function creerEspace(formData: FormData) {
  const me = await requireAdmin();
  const d = espaceSchema.parse({
    nom: formData.get("nom") ?? "",
    couleur: formData.get("couleur") ?? "",
    modules: (formData.getAll("modules") as string[]).filter((m) =>
      Object.values(MODULES).includes(m as never)
    ),
    adresse: formData.get("adresse") ?? "",
    telephone: formData.get("telephone") ?? "",
    email: formData.get("email") ?? "",
    siret: formData.get("siret") ?? "",
  });
  const base = d.nom
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "entreprise";
  let slug = base;
  for (let i = 2; await db.espace.findUnique({ where: { slug }, select: { id: true } }); i++) {
    slug = `${base}-${i}`;
  }
  const espace = await db.espace.create({
    data: {
      nom: d.nom,
      slug,
      couleur: d.couleur ? d.couleur.toLowerCase() : null,
      modules: d.modules,
      adresse: d.adresse || null,
      telephone: d.telephone || null,
      email: d.email || null,
      siret: d.siret || null,
      membres: { create: { userId: me.id, role: "ADMIN" } },
    },
  });
  await audit(
    { id: me.id, name: me.name, role: "ADMIN" },
    {
      action: "ESPACE_CREATED",
      entity: "Espace",
      entityId: espace.id,
      summary: `Entreprise créée : ${d.nom} (modules ${d.modules.join(", ") || "aucun"})`,
    }
  );
  revalidatePath("/admin/espaces");
  revalidatePath("/", "layout");
}

export async function majEspace(espaceId: string, formData: FormData) {
  const me = await requireAdmin();
  const d = espaceSchema.parse({
    nom: formData.get("nom") ?? "",
    couleur: formData.get("couleur") ?? "",
    modules: (formData.getAll("modules") as string[]).filter((m) =>
      Object.values(MODULES).includes(m as never)
    ),
    adresse: formData.get("adresse") ?? "",
    telephone: formData.get("telephone") ?? "",
    email: formData.get("email") ?? "",
    siret: formData.get("siret") ?? "",
  });
  const existing = await db.espace.findUnique({
    where: { id: espaceId },
    select: { nom: true, logoUrl: true },
  });
  if (!existing) throw new Error("Entreprise introuvable");
  // Logo (image uploadée, servie via /uploads comme les photos).
  let logoUrl: string | null | undefined = undefined;
  const logoFile = formData.get("logo") as File | null;
  if (logoFile && logoFile.size > 0) {
    const { saveUploadedPhoto } = await import("@/lib/upload");
    logoUrl = await saveUploadedPhoto(logoFile, "logos");
  } else if (formData.get("removeLogo") === "1") {
    logoUrl = null;
  }
  await db.espace.update({
    where: { id: espaceId },
    data: {
      nom: d.nom,
      couleur: d.couleur ? d.couleur.toLowerCase() : null,
      modules: d.modules,
      adresse: d.adresse || null,
      telephone: d.telephone || null,
      email: d.email || null,
      siret: d.siret || null,
      ...(logoUrl !== undefined && { logoUrl }),
    },
  });
  await audit(
    { id: me.id, name: me.name, role: "ADMIN" },
    {
      action: "ESPACE_UPDATED",
      entity: "Espace",
      entityId: espaceId,
      summary: `Entreprise ${d.nom} : couleur ${d.couleur || "aucune"}, modules ${d.modules.join(", ") || "aucun"}`,
    }
  );
  revalidatePath("/admin/espaces");
  // La couleur et les modules changent le chrome et la nav : on revalide tout.
  revalidatePath("/", "layout");
}
