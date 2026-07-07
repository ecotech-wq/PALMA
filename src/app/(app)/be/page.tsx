import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, DraftingCompass, MapPin, MessageSquare, Timer } from "lucide-react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ChantierStatutBadge } from "../chantiers/ChantierStatutBadge";
import { requireAuth, getAccessibleChantierIds, chantierEspaceFilter } from "@/lib/auth-helpers";

// ─── Bureau d'études : liste des études (Chantier de type ETUDE) ────────────
// Mobile d'abord : cartes empilées, actions accessibles au pouce.

export default async function EtudesPage() {
  const me = await requireAuth();
  if (me.isClient) redirect("/dashboard");

  const accessibles = await getAccessibleChantierIds(me);

  const etudes = await db.chantier.findMany({
    where: {
      AND: [
        { type: "ETUDE" },
        { archivedAt: null },
        accessibles !== null ? { id: { in: accessibles } } : {},
        // Socle espaces : bornage à l'espace courant.
        chantierEspaceFilter(me),
      ],
    },
    include: {
      chef: { select: { name: true } },
      phasesEtude: { select: { id: true } },
    },
    orderBy: [{ statut: "asc" }, { updatedAt: "desc" }],
  });

  // Heures réelles par étude (une seule requête groupée, pas une par carte).
  const sommes = etudes.length
    ? await db.tempsPasse.groupBy({
        by: ["chantierId"],
        where: { chantierId: { in: etudes.map((e) => e.id) } },
        _sum: { heures: true },
      })
    : [];
  const heuresPar = new Map(
    sommes.map((s) => [s.chantierId, Number(s._sum.heures ?? 0)])
  );

  return (
    <div>
      <PageHeader
        title="Études"
        description="Les projets du bureau d'études : phases d'honoraires, temps passés, messagerie."
        action={
          (me.isGlobalAdmin && me.espaceCourant) ? (
            <Link href="/chantiers/nouveau?type=ETUDE">
              <Button>
                <Plus size={16} />
                <span className="hidden sm:inline">Nouvelle étude</span>
                <span className="sm:hidden">Ajouter</span>
              </Button>
            </Link>
          ) : undefined
        }
      />

      {etudes.length === 0 ? (
        <EmptyState
          icon={DraftingCompass}
          title="Aucune étude"
          description="Créez la première étude du bureau : elle aura sa messagerie, ses membres, ses phases et sa saisie des temps."
          action={
            (me.isGlobalAdmin && me.espaceCourant) ? (
              <Link href="/chantiers/nouveau?type=ETUDE">
                <Button>
                  <Plus size={16} />
                  Nouvelle étude
                </Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {etudes.map((e) => (
            <div
              key={e.id}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <Link
                  href={`/be/${e.id}`}
                  className="font-medium leading-tight text-slate-900 dark:text-slate-100 hover:underline"
                >
                  {e.nom}
                </Link>
                <ChantierStatutBadge statut={e.statut} />
              </div>
              {e.adresse && (
                <p className="mt-1 flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
                  <MapPin size={14} className="shrink-0" />
                  {e.adresse}
                </p>
              )}
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                {e.phasesEtude.length} phase{e.phasesEtude.length > 1 ? "s" : ""}
                {" · "}
                {(heuresPar.get(e.id) ?? 0).toLocaleString("fr-FR")} h passées
                {e.chef?.name ? ` · resp. ${e.chef.name}` : ""}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`/be/${e.id}`}>
                  <Button variant="outline" size="sm">
                    <DraftingCompass size={14} />
                    Pilotage
                  </Button>
                </Link>
                <Link href={`/messagerie/${e.id}`}>
                  <Button variant="outline" size="sm">
                    <MessageSquare size={14} />
                    Messagerie
                  </Button>
                </Link>
                <Link href={`/be/temps?etude=${e.id}`}>
                  <Button variant="outline" size="sm">
                    <Timer size={14} />
                    Temps
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
