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
});

export async function majEspace(espaceId: string, formData: FormData) {
  const me = await requireAdmin();
  const d = espaceSchema.parse({
    nom: formData.get("nom") ?? "",
    couleur: formData.get("couleur") ?? "",
    modules: (formData.getAll("modules") as string[]).filter((m) =>
      Object.values(MODULES).includes(m as never)
    ),
  });
  const existing = await db.espace.findUnique({
    where: { id: espaceId },
    select: { nom: true },
  });
  if (!existing) throw new Error("Entreprise introuvable");
  await db.espace.update({
    where: { id: espaceId },
    data: {
      nom: d.nom,
      couleur: d.couleur ? d.couleur.toLowerCase() : null,
      modules: d.modules,
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
