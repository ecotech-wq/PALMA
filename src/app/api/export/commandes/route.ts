import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { toCsv, csvResponse } from "@/lib/csv";

/**
 * Export CSV des commandes sur une période. Une ligne par ligne de
 * commande (flatten) pour l'analyse fournisseurs / postes.
 *
 * GET /api/export/commandes?from=YYYY-MM-DD&to=YYYY-MM-DD&statut=LIVREE
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (
    session.user.role !== "ADMIN" &&
    session.user.role !== "CONDUCTEUR"
  ) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const statutParam = url.searchParams.get("statut");

  const where: {
    dateCommande?: { gte?: Date; lt?: Date };
    statut?: { in: ("COMMANDEE" | "EN_LIVRAISON" | "LIVREE" | "ANNULEE")[] };
  } = {};
  if (fromParam) {
    where.dateCommande = { ...where.dateCommande, gte: new Date(fromParam + "T00:00:00.000Z") };
  }
  if (toParam) {
    const end = new Date(toParam + "T00:00:00.000Z");
    end.setUTCDate(end.getUTCDate() + 1);
    where.dateCommande = { ...where.dateCommande, lt: end };
  }
  if (
    statutParam &&
    ["COMMANDEE", "EN_LIVRAISON", "LIVREE", "ANNULEE"].includes(statutParam)
  ) {
    where.statut = {
      in: [
        statutParam as "COMMANDEE" | "EN_LIVRAISON" | "LIVREE" | "ANNULEE",
      ],
    };
  }

  // Le filtre soft-delete s'applique aussi aux exports
  (where as { deletedAt?: null }).deletedAt = null;
  const commandes = await db.commande.findMany({
    where,
    include: {
      chantier: { select: { nom: true } },
      lignes: true,
    },
    orderBy: [{ dateCommande: "desc" }],
    take: 2000,
  });

  type Row = {
    date: string;
    chantier: string;
    fournisseur: string;
    reference: string;
    statut: string;
    mode: string;
    designation: string;
    quantite: string;
    prix_unitaire: string;
    total_ligne: string;
    total_commande: string;
  };

  const rows: Row[] = [];
  for (const c of commandes) {
    for (const l of c.lignes) {
      rows.push({
        date: c.dateCommande.toISOString().slice(0, 10),
        chantier: c.chantier.nom,
        fournisseur: c.fournisseur,
        reference: c.reference ?? "",
        statut: c.statut,
        mode: c.mode,
        designation: l.designation,
        quantite: Number(l.quantite).toString(),
        prix_unitaire: Number(l.prixUnitaire).toFixed(2),
        total_ligne: Number(l.total).toFixed(2),
        total_commande: Number(c.coutTotal).toFixed(2),
      });
    }
    if (c.lignes.length === 0) {
      rows.push({
        date: c.dateCommande.toISOString().slice(0, 10),
        chantier: c.chantier.nom,
        fournisseur: c.fournisseur,
        reference: c.reference ?? "",
        statut: c.statut,
        mode: c.mode,
        designation: "—",
        quantite: "",
        prix_unitaire: "",
        total_ligne: "",
        total_commande: Number(c.coutTotal).toFixed(2),
      });
    }
  }

  const csv = toCsv(rows, {
    headers: [
      { key: "date", label: "Date commande" },
      { key: "chantier", label: "Chantier" },
      { key: "fournisseur", label: "Fournisseur" },
      { key: "reference", label: "Référence" },
      { key: "statut", label: "Statut" },
      { key: "mode", label: "Mode paiement" },
      { key: "designation", label: "Désignation" },
      { key: "quantite", label: "Quantité" },
      { key: "prix_unitaire", label: "Prix unitaire (€)" },
      { key: "total_ligne", label: "Total ligne (€)" },
      { key: "total_commande", label: "Total commande (€)" },
    ],
  });

  const suffix = [fromParam, toParam].filter(Boolean).join("_") || "tous";
  return csvResponse(`commandes_${suffix}.csv`, csv);
}
