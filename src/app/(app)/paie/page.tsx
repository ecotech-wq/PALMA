import Link from "next/link";
import { Plus, Banknote, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { formatEuro, formatDate } from "@/lib/utils";

export default async function PaieListPage() {
  const [paiements, ouvriersAvecBesoin] = await Promise.all([
    db.paiement.findMany({
      include: {
        ouvrier: { select: { id: true, nom: true, prenom: true } },
      },
      orderBy: { date: "desc" },
      take: 50,
    }),
    db.ouvrier.findMany({
      where: { actif: true },
      include: {
        pointages: {
          where: { date: { gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) } },
        },
        avances: { where: { reglee: false } },
      },
    }),
  ]);

  const totalCalcule = paiements
    .filter((p) => p.statut === "CALCULE")
    .reduce((s, p) => s + Number(p.montantNet), 0);

  return (
    <div>
      <PageHeader
        title="Paie"
        description="Génération et historique des paiements"
        action={
          <Link href="/paie/nouveau">
            <Button>
              <Plus size={16} />
              <span className="hidden sm:inline">Nouveau paiement</span>
              <span className="sm:hidden">Nouveau</span>
            </Button>
          </Link>
        }
      />

      {totalCalcule > 0 && (
        <Card className="mb-5 bg-amber-50 border-amber-200">
          <CardBody className="flex items-center gap-3">
            <Banknote className="text-amber-700 shrink-0" size={20} />
            <div className="flex-1 text-sm text-amber-900">
              <span className="font-semibold">{formatEuro(totalCalcule)}</span> en attente de
              versement (paiements calculés mais non payés).
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Historique des paiements</CardTitle>
        </CardHeader>
        <CardBody className="!p-0">
          {paiements.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={Banknote}
                title="Aucun paiement"
                description="Crée tes premiers paiements après avoir saisi du pointage. Les avances et retenues outils seront automatiquement déduites."
                action={
                  <Link href="/paie/nouveau">
                    <Button>
                      <Plus size={16} /> Générer un paiement
                    </Button>
                  </Link>
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {paiements.map((p) => {
                const fullName = [p.ouvrier.prenom, p.ouvrier.nom].filter(Boolean).join(" ");
                return (
                  <li key={p.id}>
                    <Link
                      href={`/paie/${p.id}`}
                      className="flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-900 transition"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{fullName}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
                          Du {formatDate(p.periodeDebut)} au {formatDate(p.periodeFin)} ·{" "}
                          {Number(p.joursTravailles)} j ·{" "}
                          {p.statut === "PAYE" ? (
                            <Badge color="green">Payé</Badge>
                          ) : p.statut === "ANNULE" ? (
                            <Badge color="red">Annulé</Badge>
                          ) : (
                            <Badge color="yellow">À verser</Badge>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-semibold">{formatEuro(p.montantNet.toString())}</div>
                        <div className="text-xs text-slate-400 dark:text-slate-500">
                          {p.mode === "ESPECES" ? "Espèces" : "Virement"}
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-slate-300" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
