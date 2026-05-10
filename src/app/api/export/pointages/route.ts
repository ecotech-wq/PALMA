import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { toCsv, csvResponse } from "@/lib/csv";

/**
 * Export CSV des pointages sur une période.
 *
 * GET /api/export/pointages?from=YYYY-MM-DD&to=YYYY-MM-DD&ouvrierId=...&chantierId=...
 *
 * Tous les paramètres sont optionnels. Sans `from/to`, on prend les 365
 * derniers jours par défaut (pour ne pas tout dump).
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const ouvrierIdParam = url.searchParams.get("ouvrierId");
  const chantierIdParam = url.searchParams.get("chantierId");

  // Bornes par défaut : 1 an glissant
  const today = new Date();
  const defaultFrom = new Date(today);
  defaultFrom.setUTCFullYear(today.getUTCFullYear() - 1);

  const start = fromParam
    ? new Date(fromParam + "T00:00:00.000Z")
    : defaultFrom;
  const endInclusive = toParam ? new Date(toParam + "T00:00:00.000Z") : today;
  const endExclusive = new Date(endInclusive);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

  const pointages = await db.pointage.findMany({
    where: {
      date: { gte: start, lt: endExclusive },
      ...(ouvrierIdParam ? { ouvrierId: ouvrierIdParam } : {}),
      ...(chantierIdParam ? { chantierId: chantierIdParam } : {}),
    },
    include: {
      ouvrier: {
        select: {
          nom: true,
          prenom: true,
          typeContrat: true,
        },
      },
      chantier: { select: { nom: true } },
    },
    orderBy: [{ date: "asc" }, { ouvrierId: "asc" }],
    take: 5000,
  });

  const rows = pointages.map((p) => ({
    date: p.date.toISOString().slice(0, 10),
    nom: p.ouvrier.nom,
    prenom: p.ouvrier.prenom ?? "",
    contrat: p.ouvrier.typeContrat,
    jours: Number(p.joursTravailles),
    chantier: p.chantier?.nom ?? "",
    note: p.note ?? "",
  }));

  const csv = toCsv(rows, {
    headers: [
      { key: "date", label: "Date" },
      { key: "nom", label: "Nom" },
      { key: "prenom", label: "Prénom" },
      { key: "contrat", label: "Type contrat" },
      { key: "jours", label: "Jours travaillés" },
      { key: "chantier", label: "Chantier" },
      { key: "note", label: "Note" },
    ],
  });

  const fileSuffix =
    [fromParam, toParam].filter(Boolean).join("_") || "365j";
  return csvResponse(`pointages_${fileSuffix}.csv`, csv);
}
