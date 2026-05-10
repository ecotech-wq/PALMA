import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { toCsv, csvResponse } from "@/lib/csv";

const statutLabel: Record<string, string> = {
  CALCULE: "À verser",
  PAYE: "Payé",
  ANNULE: "Annulé",
};

/**
 * Export CSV des paiements sur une période.
 *
 * GET /api/export/paiements?from=YYYY-MM-DD&to=YYYY-MM-DD&statut=PAYE
 *
 * Sans paramètre : tous les paiements (limite 1000).
 * `statut` accepte CALCULE / PAYE / ANNULE.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const statutParam = url.searchParams.get("statut");

  // Filtre période : recouvrement avec [from, to]
  const where: {
    statut?: { in: ("CALCULE" | "PAYE" | "ANNULE")[] };
    periodeDebut?: { lt: Date };
    periodeFin?: { gte: Date };
  } = {};

  if (statutParam && ["CALCULE", "PAYE", "ANNULE"].includes(statutParam)) {
    where.statut = { in: [statutParam as "CALCULE" | "PAYE" | "ANNULE"] };
  }

  if (fromParam) {
    where.periodeFin = { gte: new Date(fromParam + "T00:00:00.000Z") };
  }
  if (toParam) {
    const end = new Date(toParam + "T00:00:00.000Z");
    end.setUTCDate(end.getUTCDate() + 1);
    where.periodeDebut = { lt: end };
  }

  const paiements = await db.paiement.findMany({
    where,
    include: {
      ouvrier: {
        select: {
          nom: true,
          prenom: true,
          typeContrat: true,
          telephone: true,
        },
      },
    },
    orderBy: [{ date: "desc" }, { id: "asc" }],
    take: 1000,
  });

  const rows = paiements.map((p) => ({
    nom: p.ouvrier.nom,
    prenom: p.ouvrier.prenom ?? "",
    contrat: p.ouvrier.typeContrat,
    telephone: p.ouvrier.telephone ?? "",
    periode_debut: p.periodeDebut.toISOString().slice(0, 10),
    periode_fin: p.periodeFin.toISOString().slice(0, 10),
    jours: Number(p.joursTravailles),
    montant_brut: Number(p.montantBrut).toFixed(2),
    avances_deduites: Number(p.avancesDeduites).toFixed(2),
    retenue_outil: Number(p.retenueOutil).toFixed(2),
    montant_net: Number(p.montantNet).toFixed(2),
    mode: p.mode === "ESPECES" ? "Espèces" : "Virement",
    statut: statutLabel[p.statut] ?? p.statut,
    date_paiement: p.date.toISOString().slice(0, 10),
  }));

  const csv = toCsv(rows, {
    headers: [
      { key: "nom", label: "Nom" },
      { key: "prenom", label: "Prénom" },
      { key: "contrat", label: "Type contrat" },
      { key: "telephone", label: "Téléphone" },
      { key: "periode_debut", label: "Période début" },
      { key: "periode_fin", label: "Période fin" },
      { key: "jours", label: "Jours travaillés" },
      { key: "montant_brut", label: "Brut (€)" },
      { key: "avances_deduites", label: "Avances déduites (€)" },
      { key: "retenue_outil", label: "Retenue outils (€)" },
      { key: "montant_net", label: "Net (€)" },
      { key: "mode", label: "Mode" },
      { key: "statut", label: "Statut" },
      { key: "date_paiement", label: "Date paiement" },
    ],
  });

  const fileSuffix = [fromParam, toParam].filter(Boolean).join("_") || "tous";
  return csvResponse(`paiements_${fileSuffix}.csv`, csv);
}
