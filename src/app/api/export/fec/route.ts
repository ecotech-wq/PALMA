import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

/* -------------------------------------------------------------------------
 *  Export FEC (Fichier des Écritures Comptables)
 *
 *  Format : tab-separated, UTF-8, CRLF. 18 colonnes obligatoires
 *  (arrêté du 29 juillet 2013).
 *
 *  Mapping comptable par défaut (peut être affiné par un comptable) :
 *    Paiements salariés payés → 641000 D / 530000 (espèces) ou 512000
 *                              (virement) C
 *    Commandes livrées        → 606000 D / 401000 C
 *    Locations clôturées      → 613000 D / 401000 C
 *
 *  Un seul exercice par appel : ?from=YYYY-MM-DD&to=YYYY-MM-DD&siren=000000000
 *  Le nom du fichier suit la convention : <SIREN>FEC<YYYYMMDD>.txt
 *  (avec YYYYMMDD = date de clôture de l'exercice).
 * ----------------------------------------------------------------------- */

type Ecriture = {
  journalCode: string;
  journalLib: string;
  ecritureNum: string;
  ecritureDate: string; // YYYYMMDD
  compteNum: string;
  compteLib: string;
  compAuxNum: string;
  compAuxLib: string;
  pieceRef: string;
  pieceDate: string;
  ecritureLib: string;
  debit: string; // "1234.56" ou "0.00"
  credit: string;
  ecritureLet: string;
  dateLet: string;
  validDate: string;
  montantDevise: string;
  iDevise: string;
};

function fmtDateYYYYMMDD(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function fmtMontant(n: number): string {
  // FEC : décimale = virgule en français mais point accepté ; on garde
  // virgule (norme administrative française).
  return n.toFixed(2).replace(".", ",");
}

function safe(s: string | null | undefined): string {
  if (!s) return "";
  // Pas de tabulation ni newline dans les valeurs (FEC est TSV)
  return s.replace(/[\t\r\n]/g, " ").trim();
}

function row(e: Ecriture): string {
  return [
    e.journalCode,
    e.journalLib,
    e.ecritureNum,
    e.ecritureDate,
    e.compteNum,
    e.compteLib,
    e.compAuxNum,
    e.compAuxLib,
    e.pieceRef,
    e.pieceDate,
    e.ecritureLib,
    e.debit,
    e.credit,
    e.ecritureLet,
    e.dateLet,
    e.validDate,
    e.montantDevise,
    e.iDevise,
  ].join("\t");
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return new Response("Forbidden — admin uniquement", { status: 403 });
  }

  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const siren = (url.searchParams.get("siren") || "000000000")
    .replace(/[^0-9]/g, "")
    .slice(0, 9)
    .padStart(9, "0");

  if (!fromParam || !toParam) {
    return new Response(
      "Période requise (paramètres from et to au format YYYY-MM-DD)",
      { status: 400 }
    );
  }

  const start = new Date(fromParam + "T00:00:00.000Z");
  const endInclusive = new Date(toParam + "T00:00:00.000Z");
  const endExclusive = new Date(endInclusive);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

  // Charge tout ce qui peut générer des écritures sur la période
  const [paiements, commandesLivrees, locationsCloturees] = await Promise.all([
    db.paiement.findMany({
      where: {
        statut: "PAYE",
        date: { gte: start, lt: endExclusive },
      },
      include: {
        ouvrier: { select: { nom: true, prenom: true } },
      },
      orderBy: { date: "asc" },
    }),
    db.commande.findMany({
      where: {
        statut: "LIVREE",
        dateLivraisonReelle: { gte: start, lt: endExclusive, not: null },
        deletedAt: null,
      },
      include: { chantier: { select: { nom: true } } },
      orderBy: { dateLivraisonReelle: "asc" },
    }),
    db.locationPret.findMany({
      where: {
        cloture: true,
        type: "LOCATION",
        dateRetourReel: { gte: start, lt: endExclusive, not: null },
      },
      include: { chantier: { select: { nom: true } } },
      orderBy: { dateRetourReel: "asc" },
    }),
  ]);

  const ecritures: Ecriture[] = [];
  let num = 0;
  const validDate = fmtDateYYYYMMDD(new Date());

  // PAIE
  for (const p of paiements) {
    num += 1;
    const n = String(num).padStart(6, "0");
    const date = fmtDateYYYYMMDD(p.date);
    const lib = `Salaire ${p.ouvrier.nom}${p.ouvrier.prenom ? " " + p.ouvrier.prenom : ""} ${p.periodeDebut.toISOString().slice(0, 10)} - ${p.periodeFin.toISOString().slice(0, 10)}`;
    const net = Number(p.montantNet);
    const compteContrepartie =
      p.mode === "ESPECES"
        ? { num: "530000", lib: "Caisse" }
        : { num: "512000", lib: "Banque" };

    ecritures.push({
      journalCode: "PAIE",
      journalLib: "Paie",
      ecritureNum: n,
      ecritureDate: date,
      compteNum: "641000",
      compteLib: "Rémunérations du personnel",
      compAuxNum: "",
      compAuxLib: "",
      pieceRef: `PAIE-${p.id.slice(0, 8)}`,
      pieceDate: date,
      ecritureLib: safe(lib),
      debit: fmtMontant(net),
      credit: "0,00",
      ecritureLet: "",
      dateLet: "",
      validDate,
      montantDevise: "",
      iDevise: "",
    });
    ecritures.push({
      journalCode: "PAIE",
      journalLib: "Paie",
      ecritureNum: n,
      ecritureDate: date,
      compteNum: compteContrepartie.num,
      compteLib: compteContrepartie.lib,
      compAuxNum: "",
      compAuxLib: "",
      pieceRef: `PAIE-${p.id.slice(0, 8)}`,
      pieceDate: date,
      ecritureLib: safe(lib),
      debit: "0,00",
      credit: fmtMontant(net),
      ecritureLet: "",
      dateLet: "",
      validDate,
      montantDevise: "",
      iDevise: "",
    });
  }

  // ACH — Commandes livrées
  for (const c of commandesLivrees) {
    num += 1;
    const n = String(num).padStart(6, "0");
    const date = fmtDateYYYYMMDD(c.dateLivraisonReelle ?? c.dateCommande);
    const total = Number(c.coutTotal);
    const lib = `Achat ${c.fournisseur} - ${c.chantier.nom}`;

    ecritures.push({
      journalCode: "ACH",
      journalLib: "Achats",
      ecritureNum: n,
      ecritureDate: date,
      compteNum: "606000",
      compteLib: "Achats non stockés (matières et fournitures)",
      compAuxNum: "",
      compAuxLib: "",
      pieceRef: c.reference || `CMD-${c.id.slice(0, 8)}`,
      pieceDate: date,
      ecritureLib: safe(lib),
      debit: fmtMontant(total),
      credit: "0,00",
      ecritureLet: "",
      dateLet: "",
      validDate,
      montantDevise: "",
      iDevise: "",
    });
    ecritures.push({
      journalCode: "ACH",
      journalLib: "Achats",
      ecritureNum: n,
      ecritureDate: date,
      compteNum: "401000",
      compteLib: "Fournisseurs",
      compAuxNum: safe(c.fournisseur).slice(0, 16),
      compAuxLib: safe(c.fournisseur),
      pieceRef: c.reference || `CMD-${c.id.slice(0, 8)}`,
      pieceDate: date,
      ecritureLib: safe(lib),
      debit: "0,00",
      credit: fmtMontant(total),
      ecritureLet: "",
      dateLet: "",
      validDate,
      montantDevise: "",
      iDevise: "",
    });
  }

  // ACH — Locations clôturées
  for (const l of locationsCloturees) {
    num += 1;
    const n = String(num).padStart(6, "0");
    const date = fmtDateYYYYMMDD(l.dateRetourReel ?? l.dateDebut);
    const total = Number(l.coutTotal);
    const lib = `Location ${l.designation} - ${l.chantier?.nom ?? ""}`;

    ecritures.push({
      journalCode: "ACH",
      journalLib: "Achats",
      ecritureNum: n,
      ecritureDate: date,
      compteNum: "613000",
      compteLib: "Locations",
      compAuxNum: "",
      compAuxLib: "",
      pieceRef: `LOC-${l.id.slice(0, 8)}`,
      pieceDate: date,
      ecritureLib: safe(lib),
      debit: fmtMontant(total),
      credit: "0,00",
      ecritureLet: "",
      dateLet: "",
      validDate,
      montantDevise: "",
      iDevise: "",
    });
    ecritures.push({
      journalCode: "ACH",
      journalLib: "Achats",
      ecritureNum: n,
      ecritureDate: date,
      compteNum: "401000",
      compteLib: "Fournisseurs",
      compAuxNum: safe(l.fournisseurNom).slice(0, 16),
      compAuxLib: safe(l.fournisseurNom),
      pieceRef: `LOC-${l.id.slice(0, 8)}`,
      pieceDate: date,
      ecritureLib: safe(lib),
      debit: "0,00",
      credit: fmtMontant(total),
      ecritureLet: "",
      dateLet: "",
      validDate,
      montantDevise: "",
      iDevise: "",
    });
  }

  // En-têtes (les 18 colonnes obligatoires)
  const headers = [
    "JournalCode",
    "JournalLib",
    "EcritureNum",
    "EcritureDate",
    "CompteNum",
    "CompteLib",
    "CompAuxNum",
    "CompAuxLib",
    "PieceRef",
    "PieceDate",
    "EcritureLib",
    "Debit",
    "Credit",
    "EcritureLet",
    "DateLet",
    "ValidDate",
    "Montantdevise",
    "Idevise",
  ].join("\t");

  const body = [headers, ...ecritures.map(row)].join("\r\n");

  // Nom de fichier conforme : <SIREN>FEC<YYYYMMDD>.txt
  const closeDate = fmtDateYYYYMMDD(endInclusive);
  const filename = `${siren}FEC${closeDate}.txt`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
