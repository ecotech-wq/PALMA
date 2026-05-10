import Link from "next/link";
import { Plus, ShoppingCart, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { CommandeStatutBadge } from "./CommandeStatutBadge";
import { formatEuro, formatDate } from "@/lib/utils";
import { requireAuth } from "@/lib/auth-helpers";

export default async function CommandesListPage() {
  const me = await requireAuth();
  const commandes = await db.commande.findMany({
    include: {
      chantier: { select: { id: true, nom: true } },
      _count: { select: { lignes: true } },
    },
    orderBy: { dateCommande: "desc" },
    take: 100,
  });

  return (
    <div>
      <PageHeader
        title="Commandes"
        description="Toutes les commandes liées aux chantiers"
        action={
          <Link href="/commandes/nouvelle">
            <Button>
              <Plus size={16} />
              <span className="hidden sm:inline">Nouvelle commande</span>
              <span className="sm:hidden">Ajouter</span>
            </Button>
          </Link>
        }
      />

      {commandes.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={ShoppingCart}
              title="Aucune commande"
              description="Enregistre toutes les commandes de matériaux faites pour tes chantiers (Point P, Leroy Merlin...)."
              action={
                <Link href="/commandes/nouvelle">
                  <Button>
                    <Plus size={16} /> Créer une commande
                  </Button>
                </Link>
              }
            />
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody className="!p-0">
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {commandes.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/commandes/${c.id}`}
                    className="flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-900 transition"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-slate-900 dark:text-slate-100 truncate">{c.fournisseur}</span>
                        <CommandeStatutBadge statut={c.statut} />
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-500 mt-0.5 truncate">
                        {c.chantier.nom} · {formatDate(c.dateCommande)} · {c._count.lignes}{" "}
                        ligne{c._count.lignes > 1 ? "s" : ""}
                        {c.reference && ` · ${c.reference}`}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-semibold">{formatEuro(c.coutTotal.toString())}</div>
                      {me.isAdmin && (
                        <div className="text-xs text-slate-400 dark:text-slate-500">
                          {c.mode === "ESPECES" ? "Espèces" : "Virement"}
                        </div>
                      )}
                    </div>
                    <ChevronRight size={16} className="text-slate-300" />
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
