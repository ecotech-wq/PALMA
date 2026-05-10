import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAuth, requireChantierAccess } from "@/lib/auth-helpers";
import { PvPrintView } from "./PvPrintView";

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

const dateShortFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Vue imprimable du PV — format OPR. Sections :
 *   1. Page de garde (informations projet)
 *   2. Pour chaque plan : image avec puces, tableau récap des réserves
 *   3. Annexe photos (3 par ligne, légendes)
 *   4. Signatures
 */
export default async function PvPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await requireAuth();
  await requireChantierAccess(me, id);

  const [chantier, pv] = await Promise.all([
    db.chantier.findUnique({
      where: { id },
      include: {
        chef: { select: { name: true, email: true } },
        clients: { select: { name: true, email: true } },
      },
    }),
    db.pvReception.findUnique({
      where: { chantierId: id },
      include: {
        plans: { orderBy: { ordre: "asc" } },
        reserves: { orderBy: { numero: "asc" } },
      },
    }),
  ]);
  if (!chantier || !pv) notFound();

  const planMap = new Map(pv.plans.map((p) => [p.id, p]));

  // Regroupement des réserves par plan (+ "sans plan" comme dernier groupe)
  const groups = pv.plans.map((plan) => ({
    plan: { id: plan.id, url: plan.url, nom: plan.nom },
    reserves: pv.reserves
      .filter((r) => r.planId === plan.id)
      .map((r) => ({
        numero: r.numero,
        texte: r.texte,
        zone: r.zone,
        lot: r.lot,
        photos: r.photos,
        hasPin: r.posX !== null && r.posY !== null,
        posX: r.posX,
        posY: r.posY,
        dateLimite: r.dateLimite ? dateShortFmt.format(new Date(r.dateLimite)) : null,
        leveLe: r.leveLe ? dateShortFmt.format(new Date(r.leveLe)) : null,
      })),
  }));
  const sansPlan = pv.reserves
    .filter((r) => r.planId === null)
    .map((r) => ({
      numero: r.numero,
      texte: r.texte,
      zone: r.zone,
      lot: r.lot,
      photos: r.photos,
      hasPin: false,
      posX: null,
      posY: null,
      dateLimite: r.dateLimite ? dateShortFmt.format(new Date(r.dateLimite)) : null,
      leveLe: r.leveLe ? dateShortFmt.format(new Date(r.leveLe)) : null,
    }));

  // Toutes les photos pour l'annexe (par puce, dans l'ordre)
  const photosAnnex = pv.reserves.flatMap((r) =>
    r.photos.map((url) => ({
      url,
      numero: r.numero,
      lot: r.lot,
      texte: r.texte,
      planNom: r.planId ? planMap.get(r.planId)?.nom ?? "Plan" : null,
    }))
  );

  return (
    <PvPrintView
      chantier={{
        nom: chantier.nom,
        adresse: chantier.adresse,
        description: chantier.description,
        chefName: chantier.chef?.name ?? null,
        chefEmail: chantier.chef?.email ?? null,
        clients: chantier.clients.map((c) => ({
          name: c.name,
          email: c.email,
        })),
      }}
      pv={{
        dateReception: dateFmt.format(new Date(pv.dateReception)),
        dateRapport: dateFmt.format(new Date()),
        texteRecap: pv.texteRecap,
        statut: pv.statut,
        nbReserves: pv.reserves.length,
        nbReservesLevees: pv.reserves.filter((r) => r.leveLe).length,
        signatureAdminUrl: pv.signatureAdminUrl,
        signatureAdminLe: pv.signatureAdminLe
          ? dateTimeFmt.format(new Date(pv.signatureAdminLe))
          : null,
        signatureClientUrl: pv.signatureClientUrl,
        signatureClientLe: pv.signatureClientLe
          ? dateTimeFmt.format(new Date(pv.signatureClientLe))
          : null,
        reservesLeveeUrl: pv.reservesLeveeUrl,
        reservesLeveeLe: pv.reservesLeveeLe
          ? dateTimeFmt.format(new Date(pv.reservesLeveeLe))
          : null,
      }}
      groups={groups}
      sansPlan={sansPlan}
      photosAnnex={photosAnnex}
    />
  );
}
