/**
 * Parseur "Quick Add" inspiré de Todoist.
 *
 * Reconnaît dans une chaîne libre :
 *  - `#chantier` → match flou sur le nom du chantier
 *  - `@equipe`   → match flou sur le nom de l'équipe
 *  - `+label`    → label (ajout multiple possible)
 *  - `p1`/`p2`/`p3`/`p4` → priorité (1 = urgent rouge, 4 = défaut gris)
 *  - dates en français : aujourd'hui, demain, après-demain, lundi, 15/06,
 *    15/06/2026, dans 3 jours, semaine prochaine, vendredi prochain
 *  - durée : "(3 jours)" ou "x3j" → durée totale (sinon 1 jour)
 *
 * Ce qui reste après extraction = nom de la tâche.
 */

export type QuickAddTokens = {
  nom: string;
  chantierMatch: string | null;
  equipeMatch: string | null;
  labels: string[];
  priorite: 1 | 2 | 3 | 4;
  dateDebut: Date | null;
  dateFin: Date | null;
};

const NOW = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const JOURS = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
];

function nextWeekday(targetDow: number, fromNextWeek = false): Date {
  const today = NOW();
  const todayDow = today.getDay();
  let diff = targetDow - todayDow;
  if (diff <= 0) diff += 7;
  if (fromNextWeek) diff += 7;
  const d = new Date(today);
  d.setDate(d.getDate() + diff);
  return d;
}

function parseDateFromTokens(text: string): {
  date: Date | null;
  consumed: string | null;
} {
  // 1. Date au format dd/mm ou dd/mm/yyyy
  const dateRe = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/;
  const m = dateRe.exec(text);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    let year = m[3] ? parseInt(m[3], 10) : NOW().getFullYear();
    if (year < 100) year += 2000;
    if (
      day >= 1 &&
      day <= 31 &&
      month >= 0 &&
      month <= 11 &&
      year >= 1900 &&
      year <= 3000
    ) {
      const d = new Date(year, month, day);
      d.setHours(0, 0, 0, 0);
      return { date: d, consumed: m[0] };
    }
  }

  // 2. Mots-clés français
  const lower = text.toLowerCase();
  const keywords: { pattern: RegExp; resolve: () => Date }[] = [
    {
      pattern: /\baujourd['’]hui\b/i,
      resolve: () => NOW(),
    },
    {
      pattern: /\baprès[- ]demain\b/i,
      resolve: () => {
        const d = NOW();
        d.setDate(d.getDate() + 2);
        return d;
      },
    },
    {
      pattern: /\bdemain\b/i,
      resolve: () => {
        const d = NOW();
        d.setDate(d.getDate() + 1);
        return d;
      },
    },
    {
      pattern: /\bla\s+semaine\s+prochaine\b/i,
      resolve: () => {
        const d = NOW();
        d.setDate(d.getDate() + (8 - d.getDay()) % 7 || 7);
        return d;
      },
    },
    {
      pattern: /\bdans\s+(\d+)\s+jours?\b/i,
      resolve: () => {
        const m2 = /\bdans\s+(\d+)\s+jours?\b/i.exec(lower);
        const n = m2 ? parseInt(m2[1], 10) : 1;
        const d = NOW();
        d.setDate(d.getDate() + n);
        return d;
      },
    },
  ];

  for (const k of keywords) {
    const found = k.pattern.exec(text);
    if (found) {
      return { date: k.resolve(), consumed: found[0] };
    }
  }

  // 3. Jour de semaine ("lundi", "vendredi prochain")
  for (let i = 0; i < JOURS.length; i++) {
    const j = JOURS[i];
    // "lundi prochain" → semaine suivante
    const re1 = new RegExp(`\\b${j}\\s+prochain\\b`, "i");
    const m1 = re1.exec(text);
    if (m1) {
      return { date: nextWeekday(i, true), consumed: m1[0] };
    }
    const re2 = new RegExp(`\\b${j}\\b`, "i");
    const m2 = re2.exec(text);
    if (m2) {
      return { date: nextWeekday(i, false), consumed: m2[0] };
    }
  }

  return { date: null, consumed: null };
}

function parseDuration(text: string): { days: number | null; consumed: string | null } {
  // "x3j" ou "x 3 jours"
  const m1 = /\bx\s*(\d+)\s*j(?:ours?)?\b/i.exec(text);
  if (m1) return { days: parseInt(m1[1], 10), consumed: m1[0] };
  // "(3 jours)" ou "(3j)"
  const m2 = /\(\s*(\d+)\s*j(?:ours?)?\s*\)/i.exec(text);
  if (m2) return { days: parseInt(m2[1], 10), consumed: m2[0] };
  return { days: null, consumed: null };
}

/**
 * Parse une saisie utilisateur Quick Add. Le matching #chantier / @equipe
 * est un nettoyage du token : c'est au caller de faire le match flou
 * dans sa liste.
 */
export function parseQuickAdd(input: string): QuickAddTokens {
  let txt = input;

  // Priorité p1..p4
  let priorite: 1 | 2 | 3 | 4 = 4;
  const pMatch = /\bp([1-4])\b/i.exec(txt);
  if (pMatch) {
    priorite = parseInt(pMatch[1], 10) as 1 | 2 | 3 | 4;
    txt = txt.replace(pMatch[0], "");
  }

  // #chantier
  let chantierMatch: string | null = null;
  const cMatch = /(^|\s)#([\p{L}\p{N}_\-]+)/u.exec(txt);
  if (cMatch) {
    chantierMatch = cMatch[2];
    txt = txt.replace(cMatch[0], cMatch[1]);
  }

  // @equipe
  let equipeMatch: string | null = null;
  const eMatch = /(^|\s)@([\p{L}\p{N}_\-]+)/u.exec(txt);
  if (eMatch) {
    equipeMatch = eMatch[2];
    txt = txt.replace(eMatch[0], eMatch[1]);
  }

  // +labels (peuvent être plusieurs)
  const labels: string[] = [];
  const labelRe = /(^|\s)\+([\p{L}\p{N}_\-]+)/gu;
  let lm: RegExpExecArray | null;
  const labelTokens: string[] = [];
  while ((lm = labelRe.exec(txt)) !== null) {
    labels.push(lm[2]);
    labelTokens.push(lm[0]);
  }
  for (const t of labelTokens) {
    txt = txt.replace(t, " ");
  }

  // Date
  const { date: dateDebut, consumed: dateConsumed } = parseDateFromTokens(txt);
  if (dateConsumed) txt = txt.replace(dateConsumed, "");

  // Durée
  const { days, consumed: durConsumed } = parseDuration(txt);
  if (durConsumed) txt = txt.replace(durConsumed, "");

  let dateFin: Date | null = null;
  if (dateDebut) {
    if (days && days > 0) {
      const d = new Date(dateDebut);
      d.setDate(d.getDate() + days - 1);
      dateFin = d;
    } else {
      // Par défaut : 1 jour (dateFin = dateDebut)
      dateFin = new Date(dateDebut);
    }
  }

  // Nom = ce qui reste, espaces normalisés
  const nom = txt.replace(/\s+/g, " ").trim();

  return {
    nom,
    chantierMatch,
    equipeMatch,
    labels,
    priorite,
    dateDebut,
    dateFin,
  };
}

/**
 * Match flou : retourne l'élément dont le nom contient (insensitive) le
 * token, ou démarre par lui. Utilisé pour résoudre #chantier / @equipe.
 */
export function fuzzyMatch<T extends { id: string; nom: string }>(
  list: T[],
  token: string
): T | null {
  if (!token) return null;
  const t = token.toLowerCase().replace(/[-_]/g, " ").trim();
  if (!t) return null;
  // Match exact d'abord
  const exact = list.find((x) => x.nom.toLowerCase() === t);
  if (exact) return exact;
  // Puis startsWith
  const starts = list.find((x) => x.nom.toLowerCase().startsWith(t));
  if (starts) return starts;
  // Puis includes
  const incl = list.find((x) => x.nom.toLowerCase().includes(t));
  return incl ?? null;
}
