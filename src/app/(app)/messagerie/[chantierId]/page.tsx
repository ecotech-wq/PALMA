import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Settings2 } from "lucide-react";
import { db } from "@/lib/db";
import { Card, CardBody } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { ChantierComposer } from "../ChantierComposer";
import { ChantierFeed } from "../ChantierFeed";
import { requireAuth, requireChantierAccess } from "@/lib/auth-helpers";

/**
 * Le fil d'un chantier — vue chat WhatsApp-like. Affiche les N derniers
 * jours de messages, avec composer en bas pour poster (et créer auto
 * incidents / demandes / sorties / rapports).
 */
export default async function MessagerieChantierPage({
  params,
}: {
  params: Promise<{ chantierId: string }>;
}) {
  const { chantierId } = await params;
  const me = await requireAuth();
  if (me.isClient) redirect("/dashboard");
  await requireChantierAccess(me, chantierId);

  // Fenêtre par défaut : 14 derniers jours
  const now = new Date();
  const since = new Date(now);
  since.setDate(since.getDate() - 14);
  since.setHours(0, 0, 0, 0);

  const [chantier, messages, materiels, equipes, sortiesOuvertes] =
    await Promise.all([
      db.chantier.findUnique({
        where: { id: chantierId },
        select: {
          id: true,
          nom: true,
          adresse: true,
          chef: { select: { id: true, name: true } },
        },
      }),
      db.journalMessage.findMany({
        where: { chantierId, createdAt: { gte: since } },
        include: {
          author: { select: { id: true, name: true, role: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      db.materiel.findMany({
        where: { statut: { in: ["DISPO", "SORTI"] } },
        select: { id: true, nomCommun: true, statut: true },
        orderBy: { nomCommun: "asc" },
      }),
      db.equipe.findMany({
        where: { OR: [{ chantierId }, { chantierId: null }] },
        select: { id: true, nom: true },
        orderBy: { nom: "asc" },
      }),
      db.sortieMateriel.findMany({
        where: {
          chantierId,
          dateRetour: null,
        },
        select: {
          id: true,
          dateSortie: true,
          materiel: { select: { nomCommun: true } },
        },
        orderBy: { dateSortie: "desc" },
      }),
    ]);
  if (!chantier) notFound();

  const sortiesForComposer = sortiesOuvertes.map((s) => ({
    id: s.id,
    materielNom: s.materiel.nomCommun,
    dateSortie: s.dateSortie,
  }));

  return (
    <div className="flex flex-col h-[calc(100vh-160px)] min-h-[500px]">
      <PageHeader
        title={chantier.nom}
        description={
          chantier.adresse ?? "Fil du chantier — messages et événements"
        }
        backHref="/messagerie"
        action={
          <div className="flex items-center gap-2">
            <Link href={`/chantiers/${chantierId}`}>
              <button className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                <Settings2 size={14} /> Fiche chantier
              </button>
            </Link>
          </div>
        }
      />

      {/* Feed scrollable */}
      <div className="flex-1 min-h-0 overflow-hidden mb-3">
        <Card className="h-full">
          <CardBody className="!p-0 h-full overflow-y-auto">
            <ChantierFeed
              messages={messages.map((m) => ({
                id: m.id,
                authorId: m.authorId,
                authorName: m.author?.name ?? null,
                authorRole: m.author?.role ?? null,
                type: m.type,
                texte: m.texte,
                photos: m.photos,
                videos: m.videos,
                hiddenFromClient: m.hiddenFromClient,
                incidentId: m.incidentId,
                demandeId: m.demandeId,
                commandeId: m.commandeId,
                sortieId: m.sortieId,
                rapportId: m.rapportId,
                createdAt: m.createdAt,
              }))}
              currentUserId={me.id}
              canEdit={me.isAdmin || me.isConducteur}
            />
          </CardBody>
        </Card>
      </div>

      {/* Composer fixé en bas */}
      <div className="shrink-0">
        <ChantierComposer
          chantierId={chantierId}
          materiels={materiels}
          equipes={equipes}
          sortiesOuvertes={sortiesForComposer}
          canHideFromClient={me.isAdmin || me.isConducteur}
        />
      </div>
    </div>
  );
}
