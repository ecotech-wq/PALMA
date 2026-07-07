import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, getAccessibleChantierIds, espaceFilter } from "@/lib/auth-helpers";

/* -------------------------------------------------------------------------
 *  Recherche globale (command palette Ctrl+K).
 *  Query param: ?q=...
 *  Renvoie un tableau groupé par entité avec : id, title, subtitle, href.
 *
 *  Respecte les restrictions d'accès (chef = ses chantiers, client = ses
 *  chantiers en lecture, admin/conducteur = tout).
 *  Les ouvriers/matériel/paie ne remontent PAS pour CHEF/CLIENT.
 * ----------------------------------------------------------------------- */

export type SearchResult = {
  id: string;
  group:
    | "chantier"
    | "ouvrier"
    | "materiel"
    | "incident"
    | "demande"
    | "commande"
    | "message";
  title: string;
  subtitle?: string | null;
  href: string;
};

const LIMIT_PER_GROUP = 5;

export async function GET(req: Request) {
  try {
    const me = await requireAuth();
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    if (q.length < 2) {
      return NextResponse.json({ results: [] as SearchResult[] });
    }
    const ids = await getAccessibleChantierIds(me);
    const chantierFilter = ids === null ? {} : { id: { in: ids } };
    const chantierFilterRef = ids === null ? {} : { chantierId: { in: ids } };

    const showPrices = me.canSeePrices;
    const isPilot = me.canPilot;

    const [
      chantiers,
      ouvriers,
      materiels,
      incidents,
      demandes,
      commandes,
      messages,
    ] = await Promise.all([
      db.chantier.findMany({
        where: {
          ...chantierFilter,
          archivedAt: null,
          OR: [
            { nom: { contains: q, mode: "insensitive" } },
            { adresse: { contains: q, mode: "insensitive" } },
          ],
        },
        select: { id: true, nom: true, adresse: true },
        take: LIMIT_PER_GROUP,
      }),
      // Ouvriers : admin + conducteur uniquement, bornés à l'espace
      isPilot
        ? db.ouvrier.findMany({
            where: {
              ...espaceFilter(me),
              OR: [
                { nom: { contains: q, mode: "insensitive" } },
                { telephone: { contains: q, mode: "insensitive" } },
              ],
            },
            select: { id: true, nom: true, telephone: true },
            take: LIMIT_PER_GROUP,
          })
        : [],
      // Matériel : admin + conducteur uniquement (chef voit "sa" liste séparée)
      isPilot
        ? db.materiel.findMany({
            where: {
              OR: [
                { nomCommun: { contains: q, mode: "insensitive" } },
                { marque: { contains: q, mode: "insensitive" } },
                { modele: { contains: q, mode: "insensitive" } },
              ],
            },
            select: {
              id: true,
              nomCommun: true,
              marque: true,
              modele: true,
              statut: true,
            },
            take: LIMIT_PER_GROUP,
          })
        : [],
      db.incident.findMany({
        where: {
          ...chantierFilterRef,
          OR: [
            { titre: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          titre: true,
          gravite: true,
          chantier: { select: { nom: true } },
        },
        orderBy: { createdAt: "desc" },
        take: LIMIT_PER_GROUP,
      }),
      // Demandes : pilote uniquement (chef voit ses propres demandes via la liste)
      isPilot
        ? db.demandeMateriel.findMany({
            where: {
              ...chantierFilterRef,
              description: { contains: q, mode: "insensitive" },
            },
            select: {
              id: true,
              description: true,
              statut: true,
              chantier: { select: { nom: true } },
            },
            orderBy: { createdAt: "desc" },
            take: LIMIT_PER_GROUP,
          })
        : [],
      // Commandes : seulement pour ceux qui voient les prix
      showPrices
        ? db.commande.findMany({
            where: {
              ...chantierFilterRef,
              deletedAt: null,
              OR: [
                { fournisseur: { contains: q, mode: "insensitive" } },
                { reference: { contains: q, mode: "insensitive" } },
                { note: { contains: q, mode: "insensitive" } },
              ],
            },
            select: {
              id: true,
              fournisseur: true,
              reference: true,
              statut: true,
              chantier: { select: { nom: true } },
            },
            orderBy: { createdAt: "desc" },
            take: LIMIT_PER_GROUP,
          })
        : [],
      // Messages du fil — pas pour les clients (qui n'ont pas accès messagerie)
      me.isClient
        ? []
        : db.journalMessage.findMany({
            where: {
              ...chantierFilterRef,
              texte: { contains: q, mode: "insensitive" },
            },
            select: {
              id: true,
              texte: true,
              chantierId: true,
              chantier: { select: { nom: true } },
              author: { select: { name: true } },
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
            take: LIMIT_PER_GROUP,
          }),
    ]);

    const results: SearchResult[] = [
      ...chantiers.map(
        (c): SearchResult => ({
          id: c.id,
          group: "chantier",
          title: c.nom,
          subtitle: c.adresse,
          href: `/chantiers/${c.id}`,
        })
      ),
      ...ouvriers.map(
        (o): SearchResult => ({
          id: o.id,
          group: "ouvrier",
          title: o.nom,
          subtitle: o.telephone,
          href: `/ouvriers/${o.id}`,
        })
      ),
      ...materiels.map(
        (m): SearchResult => ({
          id: m.id,
          group: "materiel",
          title: m.nomCommun,
          subtitle:
            [m.marque, m.modele].filter(Boolean).join(" · ") || m.statut,
          href: `/materiel/${m.id}`,
        })
      ),
      ...incidents.map(
        (i): SearchResult => ({
          id: i.id,
          group: "incident",
          title: i.titre,
          subtitle: `${i.chantier?.nom ?? ""} · ${i.gravite}`,
          href: `/incidents/${i.id}`,
        })
      ),
      ...demandes.map(
        (d): SearchResult => ({
          id: d.id,
          group: "demande",
          title: d.description.slice(0, 80),
          subtitle: `${d.chantier.nom} · ${d.statut}`,
          href: `/demandes/${d.id}`,
        })
      ),
      ...commandes.map(
        (c): SearchResult => ({
          id: c.id,
          group: "commande",
          title: c.fournisseur,
          subtitle: `${c.chantier.nom}${c.reference ? " · " + c.reference : ""} · ${c.statut}`,
          href: `/commandes/${c.id}`,
        })
      ),
      ...messages.map(
        (m): SearchResult => ({
          id: m.id,
          group: "message",
          title: (m.texte ?? "").slice(0, 80),
          subtitle: `${m.chantier.nom} · ${m.author?.name ?? "Système"}`,
          href: `/messagerie/${m.chantierId}`,
        })
      ),
    ];

    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur" },
      { status: 400 }
    );
  }
}
