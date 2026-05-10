import Link from "next/link";
import { Plus, Truck, AlertTriangle, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { formatEuro, formatDate } from "@/lib/utils";
import { requireAuth } from "@/lib/auth-helpers";

export default async function LocationsPage() {
  const me = await requireAuth();
  const today = new Date();

  const [encours, cloturees] = await Promise.all([
    db.locationPret.findMany({
      where: { cloture: false },
      include: { chantier: { select: { id: true, nom: true } } },
      orderBy: { dateFinPrevue: "asc" },
    }),
    db.locationPret.findMany({
      where: { cloture: true },
      include: { chantier: { select: { id: true, nom: true } } },
      orderBy: { dateRetourReel: "desc" },
      take: 30,
    }),
  ]);

  const totalLocationsEnCours = encours
    .filter((l) => l.type === "LOCATION")
    .reduce((s, l) => s + Number(l.coutTotal), 0);

  const enRetard = encours.filter((l) => new Date(l.dateFinPrevue) < today);

  return (
    <div>
      <PageHeader
        title="Locations / Prêts"
        description="Matériel loué ou prêté à restituer"
        action={
          <Link href="/locations/nouvelle">
            <Button>
              <Plus size={16} />
              <span className="hidden sm:inline">Nouvelle</span>
              <span className="sm:hidden">Ajouter</span>
            </Button>
          </Link>
        }
      />

      {enRetard.length > 0 && (
        <Card className="mb-5 bg-red-50 border-red-200">
          <CardBody className="flex items-center gap-3">
            <AlertTriangle className="text-red-600 shrink-0" size={20} />
            <div className="flex-1 text-sm text-red-900">
              <span className="font-semibold">{enRetard.length}</span> location(s)/prêt(s) en
              retard de restitution.
            </div>
          </CardBody>
        </Card>
      )}

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>En cours ({encours.length})</CardTitle>
        </CardHeader>
        <CardBody className="!p-0">
          {encours.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={Truck}
                title="Rien en location ni en prêt"
                description="Quand tu loues du matériel ou que quelqu'un te prête quelque chose, ajoute-le ici pour suivre les retours."
                action={
                  <Link href="/locations/nouvelle">
                    <Button>
                      <Plus size={16} /> Ajouter une location
                    </Button>
                  </Link>
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {encours.map((l) => {
                const enRetardItem = new Date(l.dateFinPrevue) < today;
                return (
                  <li key={l.id}>
                    <Link
                      href={`/locations/${l.id}`}
                      className="flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-900 transition"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                            {l.designation}
                          </span>
                          <Badge color={l.type === "LOCATION" ? "purple" : "blue"}>
                            {l.type === "LOCATION" ? "Location" : "Prêt"}
                          </Badge>
                          {enRetardItem && <Badge color="red">En retard</Badge>}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-500 mt-0.5 truncate">
                          {l.fournisseurNom}
                          {l.chantier && ` · ${l.chantier.nom}`}
                          {" · "}
                          jusqu&apos;au {formatDate(l.dateFinPrevue)}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {l.type === "LOCATION" && (
                          <div className="text-sm font-semibold">
                            {formatEuro(l.coutTotal.toString())}
                          </div>
                        )}
                        {Number(l.coutJour) > 0 && (
                          <div className="text-xs text-slate-400 dark:text-slate-500">
                            {formatEuro(l.coutJour.toString())}/j
                          </div>
                        )}
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

      {me.isAdmin && totalLocationsEnCours > 0 && (
        <div className="mb-5 text-sm text-slate-600 dark:text-slate-500">
          Total locations en cours :{" "}
          <span className="font-semibold">{formatEuro(totalLocationsEnCours)}</span>
        </div>
      )}

      {cloturees.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Clôturées (30 dernières)</CardTitle>
          </CardHeader>
          <CardBody className="!p-0">
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {cloturees.map((l) => (
                <li key={l.id} className="px-3 sm:px-5 py-2">
                  <Link
                    href={`/locations/${l.id}`}
                    className="block text-sm hover:bg-slate-50 dark:hover:bg-slate-900 -mx-3 sm:-mx-5 px-3 sm:px-5 py-1 -my-1"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-slate-700 dark:text-slate-300 truncate flex-1">
                        {l.designation}
                      </span>
                      {l.type === "LOCATION" && (
                        <span className="font-medium shrink-0">
                          {formatEuro(l.coutTotal.toString())}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span className="truncate">
                        {l.chantier?.nom || l.fournisseurNom}
                      </span>
                      <span>· {formatDate(l.dateRetourReel)}</span>
                    </div>
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
