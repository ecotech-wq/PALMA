/**
 * Génération de CSV "Excel-friendly" : séparateur point-virgule + BOM UTF-8
 * pour qu'Excel ouvre direct le fichier en français sans tout casser.
 *
 * On échappe les guillemets et on quote toute valeur contenant `;`, `"`,
 * un saut de ligne ou des espaces de bord.
 */

const SEP = ";";
const BOM = "﻿";

function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s: string;
  if (v instanceof Date) {
    // Format ISO court : 2026-05-08
    s = v.toISOString().slice(0, 10);
  } else if (typeof v === "number") {
    // Virgule française (Excel FR comprend) ou point ? On garde le point —
    // c'est plus universel et Excel FR le convertit selon ses settings.
    s = String(v);
  } else if (typeof v === "boolean") {
    s = v ? "oui" : "non";
  } else {
    s = String(v);
  }

  if (
    s.includes(SEP) ||
    s.includes('"') ||
    s.includes("\n") ||
    s.includes("\r") ||
    s !== s.trim()
  ) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Convertit un tableau d'objets en chaîne CSV.
 * Les en-têtes sont les clés du premier objet (ou les clés explicitement
 * fournies dans `headers`).
 */
export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  options?: {
    headers?: { key: keyof T & string; label: string }[];
  }
): string {
  if (rows.length === 0 && !options?.headers) {
    return BOM;
  }
  const cols =
    options?.headers ??
    Object.keys(rows[0] ?? {}).map((k) => ({ key: k, label: k }));

  const headerLine = cols.map((c) => escapeCell(c.label)).join(SEP);
  const dataLines = rows.map((row) =>
    cols.map((c) => escapeCell(row[c.key])).join(SEP)
  );

  return BOM + [headerLine, ...dataLines].join("\r\n");
}

/**
 * Renvoie un Response Next.js qui télécharge le CSV avec le bon nom de
 * fichier et les bons headers HTTP.
 */
export function csvResponse(filename: string, csv: string): Response {
  const safeName = filename.replace(/[^\w\-.]/g, "_");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "no-store",
    },
  });
}
