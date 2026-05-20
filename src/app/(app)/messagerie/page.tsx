import Link from "next/link";
import { MessageSquare, Hammer, Loader2 } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import {
  requireAuth,
  getAccessibleChantierIds,
} from "@/lib/auth-helpers";

const timeFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const todayFmt = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
});

/** Met en forme un timestamp : aujourd'hui = juste l'heure, sinon date courte */
function smartTime(d: Date | string): string {
  const dt = new Date(d);
  const today = new Date();
  if (
    dt.getFullYear() === today.getFullYear() &&
    dt.getMonth() === today.getMonth() &&
    dt.getDate() === today.getDate()
  ) {
    return todayFmt.format(dt);
  }
  return timeFmt.format(dt);
}

/**
 * Hub de la messagerie : liste des chantiers accessibles à l'utilisateur,
 * style WhatsApp. Pour chaque chantier on affiche le dernier message
 * + un compteur de non-lus (pas implémenté ici en tant que tel, mais
 * la structure le permet).
 *
 * Clic sur un chantier → /messagerie/[id] qui ouvre le fil.
 */
export default async function MessagerieHubPage() {
  const me = await requireAuth();
  if (me.isClient) {
    // Les clients n'ont pas accès à la messagerie interne
    const { redirect } = await import("next/navigation");
    redirect("/dashboard");
  }

  const accessibleIds = await getAccessibleChantierIds(me);
  const chantiers = await db.chantier.findMany({
    where: {
      archivedAt: null,
      ...(accessibleIds !== null ? { id: { in: accessibleIds } } : {}),
    },
    select: {
      id: true,
      nom: true,
      adresse: true,
      statut: true,
      chef: { select: { name: true } },
      journalMessages: {
        select: {
          id: true,
          type: true,
          texte: true,
          photos: true,
          videos: true,
          createdAt: true,
          author: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      _count: {
        select: {
          journalMessages: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Trie par dernière activité (dernier message si présent, sinon updatedAt)
  const sorted = chantiers
    .map((c) => ({
      ...c,
      lastActivity: c.journalMessages[0]?.createdAt ?? new Date(0),
    }))
    .sort(
      (a, b) =>
        new Date(b.lastActivity).getTime() -
        new Date(a.lastActivity).getTime()
    );

  return (
    <div>
      <PageHeader
        title="Messagerie"
        description="Le fil de chaque chantier — incidents, demandes, sorties, rapports en un seul endroit."
      />

      {sorted.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={MessageSquare}
              title="Aucun chantier accessible"
              description="Aucun chantier actif. Crée un chantier pour démarrer un fil de discussion."
              action={
                <Link href="/chantiers/nouveau">
                  <button className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-brand-600 text-white text-sm hover:bg-brand-700">
                    Nouveau chantier
                  </button>
                </Link>
              }
            />
          </CardBody>
        </Card>
      ) : (
        <ul className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
          {sorted.map((c) => {
            const last = c.journalMessages[0];
            const lastPreview = last
              ? (last.texte?.slice(0, 100) ?? "") ||
                (last.photos.length > 0
                  ? `📷 ${last.photos.length} photo${last.photos.length > 1 ? "s" : ""}`
                  : last.videos.length > 0
                    ? `🎥 vidéo`
                    : "[média]")
              : null;
            const typeLabel = last
              ? (
                  {
                    NOTE: "",
                    SYSTEM_INCIDENT: "⚠️ ",
                    SYSTEM_DEMANDE: "📦 ",
                    SYSTEM_COMMANDE: "🛒 ",
                    SYSTEM_RAPPORT: "📝 ",
                    SYSTEM_SORTIE: "📤 ",
                    SYSTEM_RETOUR: "📥 ",
                    BILAN_JOURNEE: "🏁 ",
                  } as const
                )[last.type] || ""
              : "";
            return (
              <li key={c.id}>
                <Link
                  href={`/messagerie/${c.id}`}
                  className="flex items-start gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
                >
                  {/* Avatar simple : initiales chantier */}
                  <div className="shrink-0 w-11 h-11 rounded-full bg-brand-100 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300 flex items-center justify-center font-bold text-sm">
                    <Hammer size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {c.nom}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                        {last
                          ? smartTime(last.createdAt)
                          : c.statut === "PLANIFIE"
                            ? "À démarrer"
                            : "—"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 truncate mt-0.5">
                      {last ? (
                        <>
                          {typeLabel}
                          {last.author?.name ? (
                            <span className="font-medium">
                              {last.author.name}
                            </span>
                          ) : (
                            <span className="italic">Système</span>
                          )}
                          {" — "}
                          {lastPreview || <span className="italic">[média]</span>}
                        </>
                      ) : (
                        <span className="italic">Aucun message — démarre la conversation</span>
                      )}
                    </p>
                    {c.adresse && (
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                        {c.adresse}
                      </p>
                    )}
                  </div>
                  {c._count.journalMessages > 0 && (
                    <Badge color="slate">
                      {c._count.journalMessages}
                    </Badge>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
