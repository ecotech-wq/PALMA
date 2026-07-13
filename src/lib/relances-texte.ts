// ─── Texte de relance client : génération PURE (testable, sans accès base) ───
// Le moteur de relances ne parle JAMAIS au client : ce module produit un texte
// RÉDIGÉ prêt à copier, que l'utilisateur colle lui-même dans son courriel ou
// son courrier. À partir de RELANCE_3, le texte mentionne les pénalités de
// retard contractuelles et l'indemnité forfaitaire de recouvrement de 40 euros
// (articles L441-10 et D441-5 du Code de commerce). Aucune date « du jour »
// n'est lue ici : tout vient des paramètres, la fonction reste déterministe.

/** Paliers de facture pour lesquels un texte de relance est proposé. */
export type PalierTexteRelance = "RELANCE_2" | "RELANCE_3" | "MISE_EN_DEMEURE";

export interface DonneesTexteRelance {
  /** Référence de la facture telle que le client la connaît. */
  reference: string;
  /** Nom du client ou du maître d'ouvrage (facultatif). */
  client?: string | null;
  /** Montant TTC facturé. */
  montantTTC: number;
  /** Solde restant dû TTC (égal au TTC si rien n'a été réglé). */
  resteDu: number;
  /** Échéance de la facture (jour UTC, comme en base). */
  dateEcheance: Date;
  /** Jours de retard révolus, tels que classés par classerFacture. */
  joursRetard: number;
  palier: PalierTexteRelance;
}

/** « 3 240,50 euros » : montant à deux décimales, format français. */
function fmtMontant(n: number): string {
  return `${n.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} euros`;
}

/** « 12/08/2026 » : date courte française, calée sur le jour UTC stocké. */
function fmtDate(d: Date): string {
  return d.toLocaleDateString("fr-FR", { timeZone: "UTC" });
}

function pluriel(n: number): string {
  return n > 1 ? "s" : "";
}

const MENTION_PENALITES =
  "les pénalités de retard contractuelles ainsi que l'indemnité forfaitaire " +
  "de recouvrement de 40 euros prévue par les articles L441-10 et D441-5 du " +
  "Code de commerce";

/**
 * Compose un texte de relance complet (objet, corps, formule de politesse),
 * prêt à copier tel quel. Ton gradué : relance formelle (RELANCE_2), dernière
 * relance avec annonce des pénalités (RELANCE_3), mise en demeure
 * (MISE_EN_DEMEURE). Jamais d'em-dash, français accentué.
 */
export function genererTexteRelanceFacture(d: DonneesTexteRelance): string {
  const objet =
    d.palier === "MISE_EN_DEMEURE"
      ? `Objet : mise en demeure de payer, facture ${d.reference}`
      : d.palier === "RELANCE_3"
        ? `Objet : dernière relance avant mise en demeure, facture ${d.reference}`
        : `Objet : relance concernant la facture ${d.reference}`;

  const paragraphes: string[] = [objet];
  if (d.client) paragraphes.push(`À l'attention de ${d.client}`);
  paragraphes.push("Madame, Monsieur,");

  // Constat commun : référence, montant TTC, échéance, ancienneté du retard.
  let constat =
    `Sauf erreur ou omission de notre part, la facture ${d.reference}, ` +
    `d'un montant de ${fmtMontant(d.montantTTC)} TTC, est arrivée à échéance ` +
    `le ${fmtDate(d.dateEcheance)} et demeure impayée depuis ` +
    `${d.joursRetard} jour${pluriel(d.joursRetard)}.`;
  if (d.resteDu < d.montantTTC) {
    constat +=
      ` Compte tenu des règlements déjà reçus, le solde restant dû s'élève ` +
      `à ${fmtMontant(d.resteDu)} TTC.`;
  }
  paragraphes.push(constat);

  if (d.palier === "RELANCE_2") {
    paragraphes.push(
      "Malgré notre précédente relance, ce règlement ne nous est pas " +
        "parvenu. Nous vous remercions de bien vouloir procéder au paiement " +
        "sous huit jours. Si votre règlement s'est croisé avec le présent " +
        "message, veuillez ne pas en tenir compte."
    );
  } else if (d.palier === "RELANCE_3") {
    paragraphes.push(
      "Malgré nos relances précédentes, ce règlement ne nous est toujours " +
        "pas parvenu. Nous vous demandons de procéder au paiement sous huit " +
        `jours. À défaut, ${MENTION_PENALITES} vous seront appliquées, et ` +
        "nous engagerons une procédure de mise en demeure."
    );
  } else {
    paragraphes.push(
      "En conséquence, nous vous mettons en demeure de régler la somme de " +
        `${fmtMontant(d.resteDu)} TTC sous huit jours à compter de la ` +
        `réception de la présente. Ce montant sera majoré de ${MENTION_PENALITES}. ` +
        "À défaut de règlement dans ce délai, nous nous réservons le droit " +
        "d'engager toute voie de recouvrement, judiciaire si nécessaire, " +
        "sans nouvel avis."
    );
  }

  paragraphes.push(
    "Veuillez agréer, Madame, Monsieur, nos salutations distinguées."
  );
  return paragraphes.join("\n\n");
}
