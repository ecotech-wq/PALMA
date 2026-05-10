import "server-only";
import { db } from "@/lib/db";

export type AppSettings = {
  joursParMois: number;
  joursParSemaine: number;
  modePaieDefault: "ESPECES" | "VIREMENT";
  nomEntreprise: string | null;
};

const DEFAULTS: AppSettings = {
  joursParMois: 23,
  joursParSemaine: 6,
  modePaieDefault: "ESPECES",
  nomEntreprise: null,
};

/**
 * Récupère les paramètres de l'app (singleton row id="singleton"). Si la
 * row n'existe pas, on la crée avec les valeurs par défaut. Sécurise
 * aussi le cas où la table n'existe pas (déploiement en cours, etc.) en
 * renvoyant les defaults.
 */
export async function getAppSettings(): Promise<AppSettings> {
  try {
    const s = await db.appSettings.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    });
    return {
      joursParMois: s.joursParMois,
      joursParSemaine: s.joursParSemaine,
      modePaieDefault:
        s.modePaieDefault === "VIREMENT" ? "VIREMENT" : "ESPECES",
      nomEntreprise: s.nomEntreprise,
    };
  } catch {
    return DEFAULTS;
  }
}
