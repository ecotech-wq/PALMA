import "server-only";
import { db } from "@/lib/db";
import { sendPushToMany } from "@/lib/push";
import { isUniqueViolation } from "@/features/messaging/core/db-errors";
import { bornerJour } from "@/lib/suivi-commercial-calc";
import {
  classerFacture,
  classerDevis,
  classerSituation,
  classerRetenue,
  diffJours,
  PREAVIS_LIBERATION_RETENUE_JOURS,
  type PalierRelance,
} from "@/lib/relances-calc";
import { classerEssai } from "@/lib/labo-calc";
import {
  SEUIL_DORMANCE_JOURS,
  estDormante,
  libelleEtape,
  type TypologieAffaire,
} from "@/lib/affaires";
import type { Prisma } from "@/generated/prisma/client";

// ─── Moteur de relances financières : balayage serveur ───────────────────────
// DOCTRINE : le moteur CONSTATE et NOTIFIE L'ÉQUIPE (notifications internes +
// push). Il n'écrit JAMAIS au client et ne change JAMAIS un statut métier :
// « en retard » se dérive, il ne se stocke pas. L'idempotence est portée par
// RelanceLog (@@unique objetType/objetId/palier) : un objet n'est signalé
// qu'UNE fois par palier, quel que soit le nombre de balayages.
// La CLASSIFICATION vit dans relances-calc.ts (pur, testé) ; ici on charge les
// candidats (filtres SQL grossiers), on classe en mémoire, on journalise et on
// notifie les pilotes de l'espace (ADMIN + CONDUCTEUR de l'EspaceMembre, repli
// sur les admins globaux actifs si l'espace n'a aucun pilote).

export interface BilanRelances {
  /** Candidats chargés puis passés à la classification. */
  examines: number;
  /** Constats de palier (objets réellement classés à relancer). */
  constats: number;
  /** Constats NOUVEAUX : journalisés et notifiés pendant ce balayage. */
  notifiesNouveaux: number;
  /** Constats déjà journalisés à ce palier lors d'un balayage antérieur. */
  dejaTraites: number;
}

interface Constat {
  espaceId: string;
  chantierId: string | null;
  objetType: "FACTURE" | "DEVIS" | "SITUATION" | "RETENUE" | "ESSAI" | "AFFAIRE";
  objetId: string;
  palier: PalierRelance;
  titre: string;
  message: string;
  /** Lien de la notification ; à défaut, le module finance du chantier. */
  lien?: string;
  /** Destinataires imposés (affaire : son responsable) ; à défaut, les
   *  pilotes de l'espace. */
  destinataires?: string[];
}

const JOUR_MS = 24 * 3600 * 1000;

function toNum(d: Prisma.Decimal | number | null | undefined): number {
  return d == null ? 0 : Number(d);
}

/** « 3 240 euros » : montant arrondi à l'euro, format français. */
function fmtEuros(n: number): string {
  return `${Math.round(n).toLocaleString("fr-FR")} euros`;
}

/** « 12/08/2026 » : date courte française, calée sur le jour UTC stocké. */
function fmtDate(d: Date): string {
  return d.toLocaleDateString("fr-FR", { timeZone: "UTC" });
}

function lienFinance(chantierId: string | null): string {
  return chantierId ? `/finance/${chantierId}` : "/finance";
}

/**
 * Balaye factures, devis, situations, retenues et essais labo à échéance
 * dépassée, journalise chaque constat NOUVEAU dans RelanceLog et notifie
 * les pilotes de l'espace. Appelé par le
 * cron quotidien (instrumentation), la route /api/cron/relances et l'action
 * lancerAnalyseRelances. `maintenant` est injectable pour les tests.
 * `espaceIds` borne le balayage aux espaces donnés (action à la demande d'un
 * pilote) ; undefined ou null = balayage global (cron), tableau vide = rien
 * (deny par défaut, même convention que le reste du module).
 */
export async function executerRelances(
  maintenant: Date = new Date(),
  espaceIds?: string[] | null
): Promise<BilanRelances> {
  const aujourdHui = bornerJour(maintenant);
  const filtreEspace = espaceIds ? { espaceId: { in: espaceIds } } : {};
  // Bornes SQL grossières : la classification fine (bornée au jour) retranche
  // ensuite. Un jour de marge sur la retenue, dont l'échéance est un DateTime
  // libre (pas un @db.Date à minuit UTC).
  const horizonPreavisFactures = new Date(aujourdHui.getTime() + 7 * JOUR_MS);
  const horizonRetenues = new Date(
    aujourdHui.getTime() + (PREAVIS_LIBERATION_RETENUE_JOURS + 1) * JOUR_MS
  );

  // Affaires (CRM) : borne SQL grossière de la dormance. Une affaire EN_COURS
  // est candidate si sa prochaine action est échue, ou si elle n'a aucune
  // prochaine action et stagne dans son étape depuis le seuil de 14 jours
  // (marge d'un jour, la classification fine retranche).
  const horizonEtapeDormante = new Date(
    aujourdHui.getTime() - (SEUIL_DORMANCE_JOURS - 1) * JOUR_MS
  );

  const [factures, devis, situations, retenues, essais, affaires] =
    await Promise.all([
    db.facture.findMany({
      where: {
        ...filtreEspace,
        statutEmission: { in: ["EMISE", "ENVOYEE"] },
        statutReglement: { in: ["NON_PAYEE", "PARTIELLEMENT_PAYEE"] },
        type: { not: "AVOIR" },
        dateEcheance: { not: null, lte: horizonPreavisFactures },
      },
      select: {
        id: true,
        espaceId: true,
        chantierId: true,
        statutEmission: true,
        statutReglement: true,
        referenceExterne: true,
        objet: true,
        montantTTC: true,
        montantPaye: true,
        dateEcheance: true,
        marche: { select: { reference: true, maitreOuvrageNom: true } },
        clientUser: { select: { name: true } },
      },
    }),
    db.devis.findMany({
      where: { ...filtreEspace, statut: { in: ["ENVOYE", "RELANCE"] } },
      select: {
        id: true,
        espaceId: true,
        chantierId: true,
        statut: true,
        referenceExterne: true,
        objet: true,
        montantTTC: true,
        dateEmission: true,
        dateEnvoi: true,
        prochaineRelance: true,
        clientUser: { select: { name: true } },
      },
    }),
    db.situationTravaux.findMany({
      where: {
        ...filtreEspace,
        statut: { in: ["VISEE_MOE", "ACCEPTEE"] },
        factureId: null,
      },
      select: {
        id: true,
        espaceId: true,
        chantierId: true,
        statut: true,
        factureId: true,
        numeroOrdre: true,
        netAPayerPeriode: true,
        dateVisaMOE: true,
        dateEtablissement: true,
        marche: { select: { reference: true } },
      },
    }),
    db.retenueGarantie.findMany({
      where: {
        ...filtreEspace,
        statut: { in: ["RETENUE", "CONSIGNEE"] },
        dateEcheanceLiberation: { not: null, lte: horizonRetenues },
      },
      select: {
        id: true,
        espaceId: true,
        chantierId: true,
        statut: true,
        dateEcheanceLiberation: true,
        montantRetenuCumul: true,
        marche: { select: { reference: true } },
      },
    }),
    // Essais labo encore ouverts dont l'échéance (jour UTC) est passée : la
    // frontière d'espace passe par le prélèvement (EssaiLabo n'a pas
    // d'espaceId propre). Le préavis « à échéance » reste un état d'écran
    // (classerEssai), seul l'ÉCHU se relance.
    db.essaiLabo.findMany({
      where: {
        statut: { in: ["PLANIFIE", "EN_COURS"] },
        echeance: { not: null, lt: aujourdHui },
        prelevement: espaceIds ? { espaceId: { in: espaceIds } } : {},
      },
      select: {
        id: true,
        statut: true,
        type: true,
        echeance: true,
        eprouvette: { select: { code: true } },
        prelevement: {
          select: {
            id: true,
            espaceId: true,
            chantierId: true,
            reference: true,
            datePrelevement: true,
          },
        },
      },
    }),
    // Affaires EN_COURS candidates à la dormance (module affaires / CRM).
    db.affaire.findMany({
      where: {
        ...filtreEspace,
        statut: "EN_COURS",
        OR: [
          { prochaineActionLe: { not: null, lte: aujourdHui } },
          { prochaineActionLe: null, etapeDepuis: { lte: horizonEtapeDormante } },
        ],
      },
      select: {
        id: true,
        espaceId: true,
        titre: true,
        typologie: true,
        etapeCle: true,
        statut: true,
        prochaineAction: true,
        prochaineActionLe: true,
        etapeDepuis: true,
        responsableId: true,
      },
    }),
  ]);

  const constats: Constat[] = [];

  // ── Factures : préavis et paliers de retard ────────────────────────────────
  for (const f of factures) {
    const c = classerFacture(f, aujourdHui);
    if (!c) continue;
    const ref = f.referenceExterne || f.objet || "sans référence";
    const resteDu = Math.max(0, toNum(f.montantTTC) - toNum(f.montantPaye));
    const qui = f.clientUser?.name || f.marche?.maitreOuvrageNom || null;
    const contexte = [
      qui ? `Client ${qui}` : null,
      f.marche ? `marché ${f.marche.reference}` : null,
    ]
      .filter(Boolean)
      .join(", ");

    let titre: string;
    let etape: string;
    switch (c.palier) {
      case "PREAVIS_ECHEANCE":
        titre =
          c.jours === 0
            ? `Facture ${ref} à échéance aujourd'hui (${fmtEuros(resteDu)} TTC)`
            : `Facture ${ref} à échéance dans ${c.jours} j (${fmtEuros(resteDu)} TTC)`;
        etape =
          "Vérifier que le règlement est en route avant de relancer le client.";
        break;
      case "RELANCE_1":
        titre = `Facture ${ref} échue depuis ${c.jours} j (${fmtEuros(resteDu)} TTC)`;
        etape = "Relance amiable conseillée : un appel ou un courriel au client.";
        break;
      case "RELANCE_2":
        titre = `Facture ${ref} échue depuis ${c.jours} j (${fmtEuros(resteDu)} TTC)`;
        etape = "Relance formelle écrite conseillée, avec copie de la facture.";
        break;
      case "RELANCE_3":
        titre = `Facture ${ref} échue depuis ${c.jours} j (${fmtEuros(resteDu)} TTC)`;
        etape =
          "Courrier de relance recommandé conseillé avant la mise en demeure.";
        break;
      default: // MISE_EN_DEMEURE
        titre = `Facture ${ref} échue depuis ${c.jours} j : mise en demeure à préparer`;
        etape =
          "Préparer une mise en demeure : exiger le règlement, les pénalités " +
          "de retard et l'indemnité forfaitaire de recouvrement de 40 euros " +
          "(art. L441-10 du Code de commerce).";
        break;
    }
    constats.push({
      espaceId: f.espaceId,
      chantierId: f.chantierId,
      objetType: "FACTURE",
      objetId: f.id,
      palier: c.palier,
      titre,
      message: contexte ? `${contexte}. ${etape}` : etape,
    });
  }

  // ── Devis : sans réponse ───────────────────────────────────────────────────
  for (const d of devis) {
    const c = classerDevis(d, aujourdHui);
    if (!c) continue;
    const ref = d.referenceExterne || d.objet || "sans référence";
    const qui = d.clientUser?.name ? `Client ${d.clientUser.name}. ` : "";
    constats.push({
      espaceId: d.espaceId,
      chantierId: d.chantierId,
      objetType: "DEVIS",
      objetId: d.id,
      palier: c.palier,
      titre: `Devis ${ref} sans réponse depuis ${c.jours} j (${fmtEuros(toNum(d.montantTTC))} TTC)`,
      message:
        `${qui}Relancer le client, puis passer le devis en « Relancé » ` +
        "pour reprogrammer la relance suivante.",
    });
  }

  // ── Situations : validées mais non facturées ───────────────────────────────
  for (const s of situations) {
    const c = classerSituation(s, aujourdHui);
    if (!c) continue;
    const etat = s.statut === "VISEE_MOE" ? "visée MOE" : "acceptée";
    constats.push({
      espaceId: s.espaceId,
      chantierId: s.chantierId,
      objetType: "SITUATION",
      objetId: s.id,
      palier: c.palier,
      titre: `Situation n°${s.numeroOrdre} ${etat} depuis ${c.jours} j : à facturer`,
      message:
        `Marché ${s.marche.reference} : ${fmtEuros(toNum(s.netAPayerPeriode))} ` +
        "à facturer. Créer la facture depuis la situation.",
    });
  }

  // ── Retenues de garantie : libération à échéance ───────────────────────────
  for (const r of retenues) {
    const c = classerRetenue(r, aujourdHui);
    if (!c) continue;
    const montant = fmtEuros(toNum(r.montantRetenuCumul));
    const quand =
      c.jours > 0
        ? `libérable dans ${c.jours} j (le ${fmtDate(r.dateEcheanceLiberation as Date)})`
        : c.jours === 0
          ? "libérable aujourd'hui"
          : `libérable depuis ${-c.jours} j`;
    constats.push({
      espaceId: r.espaceId,
      chantierId: r.chantierId,
      objetType: "RETENUE",
      objetId: r.id,
      palier: c.palier,
      titre: `Retenue de garantie ${quand} (${montant})`,
      message:
        `Marché ${r.marche.reference}. Vérifier la levée des réserves puis ` +
        "demander la libération des fonds (ou la mainlevée de la caution).",
    });
  }

  // ── Essais labo : échéance d'écrasement (ou autre) dépassée ────────────────
  for (const e of essais) {
    const c = classerEssai(e, aujourdHui);
    if (!c || c.classe !== "ECHU") continue;
    // « J+28 » : âge de l'essai compté depuis le prélèvement (7 ou 28 jours
    // pour le flux béton, libre ailleurs).
    const age = diffJours(e.prelevement.datePrelevement, e.echeance as Date);
    const quoi = e.eprouvette ? `Éprouvette ${e.eprouvette.code}. ` : "";
    constats.push({
      espaceId: e.prelevement.espaceId,
      chantierId: e.prelevement.chantierId,
      objetType: "ESSAI",
      objetId: e.id,
      palier: "ESSAI_ECHU",
      titre:
        `Essai en retard : ${e.type.toLowerCase()} ${e.prelevement.reference} ` +
        `(J+${age} dépassé de ${c.jours} j)`,
      message:
        `${quoi}Réaliser l'essai et saisir le résultat dans le module labo.`,
      lien: `/labo/${e.prelevement.id}`,
    });
  }

  // ── Affaires dormantes : action échue ou pipeline à l'arrêt ───────────────
  for (const a of affaires) {
    const c = estDormante(a, aujourdHui);
    if (!c) continue;
    const detail =
      c.motif === "ACTION_EN_RETARD"
        ? `action en retard de ${c.jours} j`
        : "sans prochaine action";
    const etape = libelleEtape(a.typologie as TypologieAffaire, a.etapeCle);
    const consigne =
      c.motif === "ACTION_EN_RETARD" && a.prochaineAction
        ? `Action prévue : ${a.prochaineAction}. La faire (ou la replanifier) depuis la fiche.`
        : `Planifier la prochaine action depuis la fiche, ou clore l'affaire si elle est morte.`;
    constats.push({
      espaceId: a.espaceId,
      chantierId: null,
      objetType: "AFFAIRE",
      objetId: a.id,
      palier: "AFFAIRE_DORMANTE",
      titre: `Affaire dormante : ${a.titre} (${detail})`,
      message: `Étape « ${etape} » depuis ${diffJours(a.etapeDepuis, aujourdHui)} j. ${consigne}`,
      lien: `/affaires/${a.id}`,
      // Le responsable de l'affaire est prévenu en premier ; sans
      // responsable, les pilotes de l'espace (repli standard).
      destinataires: a.responsableId ? [a.responsableId] : undefined,
    });
  }

  // ── Journal (idempotence) + notifications internes ─────────────────────────
  // Destinataires résolus une fois par espace : les pilotes (ADMIN +
  // CONDUCTEUR membres de l'espace), à défaut les admins globaux actifs.
  const destinatairesParEspace = new Map<string, string[]>();
  let adminsGlobaux: string[] | null = null;

  async function destinataires(espaceId: string): Promise<string[]> {
    const connus = destinatairesParEspace.get(espaceId);
    if (connus) return connus;
    const membres = await db.espaceMembre.findMany({
      where: { espaceId, role: { in: ["ADMIN", "CONDUCTEUR"] } },
      select: { userId: true },
    });
    let ids = membres.map((m) => m.userId);
    if (ids.length === 0) {
      if (adminsGlobaux === null) {
        const admins = await db.user.findMany({
          where: { role: "ADMIN", status: "ACTIVE" },
          select: { id: true },
        });
        adminsGlobaux = admins.map((a) => a.id);
      }
      ids = adminsGlobaux;
    }
    destinatairesParEspace.set(espaceId, ids);
    return ids;
  }

  let notifiesNouveaux = 0;
  let dejaTraites = 0;

  for (const constat of constats) {
    let cibles =
      constat.destinataires ?? (await destinataires(constat.espaceId));
    // Filet de sécurité : un destinataire imposé (responsable d'affaire)
    // peut ne pas être pilote de l'espace (donnée héritée, CHEF désigné
    // avant le verrouillage des listes). Il ne pourrait alors pas ouvrir
    // le lien, et l'idempotence consommerait la relance en silence : les
    // pilotes de l'espace sont mis en copie.
    if (constat.destinataires && constat.destinataires.length > 0) {
      const pilotes = await destinataires(constat.espaceId);
      if (constat.destinataires.some((id) => !pilotes.includes(id))) {
        cibles = [...new Set([...cibles, ...pilotes])];
      }
    }
    const lien = constat.lien ?? lienFinance(constat.chantierId);
    try {
      // Journal ET notifications internes dans la MÊME transaction : soit le
      // constat est journalisé avec ses notifications, soit rien. Sans cela,
      // un crash entre les deux laisserait un RelanceLog jamais notifié, et
      // l'idempotence (P2002) interdirait toute seconde chance.
      await db.$transaction([
        db.relanceLog.create({
          data: {
            espaceId: constat.espaceId,
            chantierId: constat.chantierId,
            objetType: constat.objetType,
            objetId: constat.objetId,
            palier: constat.palier,
            resume: constat.titre,
          },
        }),
        db.notification.createMany({
          data: cibles.map((userId) => ({
            userId,
            type: "RELANCE" as const,
            title: constat.titre,
            message: constat.message,
            link: lien,
          })),
        }),
      ]);
    } catch (e) {
      if (isUniqueViolation(e)) {
        // Déjà signalé à ce palier lors d'un balayage antérieur : on saute.
        dejaTraites += 1;
        continue;
      }
      // Un constat en échec ne doit pas interrompre le balayage.
      console.error("[relances] journalisation impossible:", e);
      continue;
    }

    notifiesNouveaux += 1;
    // Web Push hors transaction, fire-and-forget : sa perte éventuelle est
    // rattrapée par la notification interne, déjà écrite.
    sendPushToMany(cibles, {
      title: constat.titre,
      body: constat.message,
      url: lien,
      tag: "RELANCE",
    }).catch(() => {});
  }

  return {
    examines:
      factures.length +
      devis.length +
      situations.length +
      retenues.length +
      essais.length +
      affaires.length,
    constats: constats.length,
    notifiesNouveaux,
    dejaTraites,
  };
}
