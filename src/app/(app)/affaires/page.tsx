import Link from "next/link";
import { redirect } from "next/navigation";
import { Handshake } from "lucide-react";
import { db } from "@/lib/db";
import { requireAuth, espaceFilter } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Onglets } from "@/components/ui/Onglets";
import {
  LIBELLES_TYPOLOGIE,
  TYPOLOGIES,
  estDormante,
  etapesDe,
  joursDansEtape,
  libelleEtape,
  valeurPipeline,
  type TypologieAffaire,
} from "@/lib/affaires";
import { AffairesKanban, type AffaireCarte } from "./AffairesKanban";
import { NouvelleAffaire } from "./NouvelleAffaire";

// ─── Affaires (CRM) : pipeline commercial par typologie ─────────────────────
// Un kanban par typologie (permis, étude structure, travaux, labo) dont les
// colonnes sont les étapes du pipeline validé. Les affaires closes (gagnées /
// perdues) vivent dans une vue repliée sous le plateau. Réservé aux pilotes
// (ADMIN + CONDUCTEUR), comme le suivi financier.

const eurosFmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function estTypologie(v: string | undefined): v is TypologieAffaire {
  return !!v && (TYPOLOGIES as string[]).includes(v);
}

export default async function AffairesPage({
  searchParams,
}: {
  searchParams: Promise<{ typologie?: string }>;
}) {
  const me = await requireAuth();
  if (!me.canPilot) redirect("/aujourdhui");
  const { typologie: brut } = await searchParams;
  const typologie: TypologieAffaire = estTypologie(brut)
    ? brut
    : "PERMIS_CONSTRUIRE";

  const affaires = await db.affaire.findMany({
    where: { ...espaceFilter(me) },
    include: { responsable: { select: { name: true } } },
    orderBy: [{ etapeDepuis: "asc" }],
  });

  const maintenant = new Date();

  // Compteurs des onglets : affaires EN COURS par typologie.
  const compteParTypologie = new Map<string, number>();
  for (const a of affaires) {
    if (a.statut !== "EN_COURS") continue;
    compteParTypologie.set(
      a.typologie,
      (compteParTypologie.get(a.typologie) ?? 0) + 1
    );
  }

  const enCours = affaires.filter(
    (a) => a.typologie === typologie && a.statut === "EN_COURS"
  );
  const closes = affaires.filter(
    (a) => a.typologie === typologie && a.statut !== "EN_COURS"
  );

  const cartes: AffaireCarte[] = enCours.map((a) => ({
    id: a.id,
    titre: a.titre,
    contactNom: a.contactNom,
    contactTel: a.contactTel,
    valeurEstimee: a.valeurEstimee === null ? null : Number(a.valeurEstimee),
    etapeCle: a.etapeCle,
    joursEtape: joursDansEtape(a.etapeDepuis, maintenant),
    dormante: estDormante(a, maintenant) !== null,
    responsable: a.responsable ? { name: a.responsable.name } : null,
  }));

  // Valeur du pipeline courant (somme des valeurs estimées en cours).
  const parEtape = valeurPipeline(
    cartes.map((c) => ({ etapeCle: c.etapeCle, valeurEstimee: c.valeurEstimee }))
  );
  const totalPipeline = Object.values(parEtape).reduce((s, v) => s + v, 0);
  const nbDormantes = cartes.filter((c) => c.dormante).length;

  // Pilotes uniquement : le module Affaires est réservé aux ADMIN et
  // CONDUCTEUR (requireAffaireAccess) ; un CHEF responsable recevrait des
  // liens /affaires/... qui le redirigent vers « Aujourd'hui ».
  const responsables = await db.user.findMany({
    where: {
      status: "ACTIVE",
      role: { in: ["ADMIN", "CONDUCTEUR"] },
      ...(me.espaceIds
        ? { espaces: { some: { espaceId: { in: me.espaceIds } } } }
        : {}),
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Affaires"
        description={
          <span>
            {enCours.length} en cours
            {totalPipeline > 0 && (
              <>
                {" "}
                · pipeline{" "}
                <span className="font-mono tabular-nums">
                  {eurosFmt.format(totalPipeline)} EUR
                </span>
              </>
            )}
            {nbDormantes > 0 && (
              <span className="font-medium text-brand-700 dark:text-brand-400">
                {" "}
                · {nbDormantes} dormante{nbDormantes > 1 ? "s" : ""}
              </span>
            )}
          </span>
        }
        action={
          <NouvelleAffaire
            typologieInitiale={typologie}
            responsables={responsables}
          />
        }
      />

      {/* Onglets de typologie (état porté par l'URL, motif Onglets). */}
      <Onglets
        actif={typologie}
        items={TYPOLOGIES.map((t) => ({
          id: t,
          label: `${LIBELLES_TYPOLOGIE[t]} (${compteParTypologie.get(t) ?? 0})`,
          href: `/affaires?typologie=${t}`,
        }))}
      />

      {cartes.length === 0 && closes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-14 text-center dark:border-slate-700">
          <Handshake size={28} className="mx-auto mb-2 text-slate-400" />
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Aucune affaire {LIBELLES_TYPOLOGIE[typologie].toLowerCase()} pour
            l&apos;instant.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Créez la première : chaque appel entrant mérite une carte.
          </p>
        </div>
      ) : (
        <AffairesKanban
          affaires={cartes}
          etapes={etapesDe(typologie)}
          canEdit={me.canPilot}
        />
      )}

      {/* Affaires closes : vue repliée, hors du plateau. */}
      {closes.length > 0 && (
        <details className="mt-5 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-200">
            Terminées ({closes.length})
          </summary>
          <ul className="divide-y divide-slate-100 border-t border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {closes.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/affaires/${a.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {a.titre}
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      {a.contactNom} · {libelleEtape(typologie, a.etapeCle)} ·{" "}
                      {dateFmt.format(a.updatedAt)}
                      {a.statut === "PERDUE" && a.motifPerte
                        ? ` · ${a.motifPerte}`
                        : ""}
                    </div>
                  </div>
                  {a.valeurEstimee !== null && (
                    <span className="hidden font-mono text-xs tabular-nums text-slate-500 sm:block">
                      {eurosFmt.format(Number(a.valeurEstimee))} EUR
                    </span>
                  )}
                  {a.statut === "GAGNEE" ? (
                    <Badge color="green">Gagnée</Badge>
                  ) : (
                    <Badge color="red">Perdue</Badge>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
