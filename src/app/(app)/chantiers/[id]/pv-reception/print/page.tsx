import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAuth, requireChantierAccess } from "@/lib/auth-helpers";
import { PvPrintView } from "./PvPrintView";

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "long",
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
 * Vue "imprimable" du PV — sans navigation, lisible en A4. Le bouton
 * "Imprimer" déclenche window.print() côté client. L'utilisateur peut
 * ensuite "Enregistrer en PDF" depuis sa boîte d'impression.
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
      select: { id: true, nom: true, adresse: true, chef: { select: { name: true } } },
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

  return (
    <PvPrintView
      chantier={{
        nom: chantier.nom,
        adresse: chantier.adresse,
        chefName: chantier.chef?.name ?? null,
      }}
      pv={{
        dateReception: dateFmt.format(new Date(pv.dateReception)),
        texteRecap: pv.texteRecap,
        statut: pv.statut,
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
      plans={pv.plans.map((plan) => ({
        id: plan.id,
        url: plan.url,
        nom: plan.nom,
        pins: pv.reserves
          .filter(
            (r) => r.planId === plan.id && r.posX !== null && r.posY !== null
          )
          .map((r) => ({
            id: r.id,
            numero: r.numero,
            posX: r.posX as number,
            posY: r.posY as number,
            leveLe: r.leveLe !== null,
          })),
      }))}
      reserves={pv.reserves.map((r) => ({
        numero: r.numero,
        texte: r.texte,
        zone: r.zone,
        photos: r.photos,
        planNom: r.planId ? planMap.get(r.planId)?.nom ?? "Plan" : null,
        leveLe: r.leveLe ? dateFmt.format(new Date(r.leveLe)) : null,
        leveNote: r.leveNote,
      }))}
    />
  );
}
