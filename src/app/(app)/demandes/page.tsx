import Link from "next/link";
import { Plus, ShoppingCart, ChevronRight, AlertCircle } from "lucide-react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { requireAuth } from "@/lib/auth-helpers";
import { DemandeStatutBadge } from "./DemandeBadges";

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const urgenceLabel: Record<string, { label: string; color: "blue" | "yellow" | "red" }> = {
  INFO: { label: "Info", color: "blue" },
  ATTENTION: { label: "Attention", color: "yellow" },
  URGENT: { label: "Urgent", color: "red" },
};

export default async function DemandesPage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string }>;
}) {
  const me = await requireAuth();
  const { statut } = await searchParams;

  const where: { statut?: "DEMANDEE" | "APPROUVEE" | "REFUSEE" | "COMMANDEE" } =
    {};
  if (statut && ["DEMANDEE", "APPROUVEE", "REFUSEE", "COMMANDEE"].includes(statut)) {
    where.statut = statut as
      | "DEMANDEE"
      | "APPROUVEE"
      | "REFUSEE"
      | "COMMANDEE";
  }

  const [demandes, counts] = await Promise.all([
    db.demandeMateriel.findMany({
      where,
      include: {
        chantier: { select: { id: true, nom: true } },
        requester: { select: { name: true } },
      },
      orderBy: [{ statut: "asc" }, { urgence: "desc" }, { createdAt: "desc" }],
      take: 100,
    }),
    db.demandeMateriel.groupBy({
      by: ["statut"],
      _count: true,
    }),
  ]);

  const cnt = (s: string) =>
    counts.find((c) => c.statut === s)?._count ?? 0;

  return (
    <div>
      <PageHeader
        title="Demandes de matériel"
        description={
          me.isAdmin
            ? "Demandes des chefs en attente de validation"
            : "Tes demandes de matériel et leur statut"
        }
        action={
          <Link href="/demandes/nouvelle">
            <Button>
              <Plus size={16} />
              <span className="hidden sm:inline">Nouvelle demande</span>
              <span className="sm:hidden">Nouvelle</span>
            </Button>
          </Link>
        }
      />

      {/* Tabs statut */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
        <FilterTab
          href="/demandes?statut=DEMANDEE"
          label="En attente"
          value={cnt("DEMANDEE")}
          color="yellow"
          active={statut === "DEMANDEE"}
        />
        <FilterTab
          href="/demandes?statut=APPROUVEE"
          label="Approuvées"
          value={cnt("APPROUVEE")}
          color="blue"
          active={statut === "APPROUVEE"}
        />
        <FilterTab
          href="/demandes?statut=COMMANDEE"
          label="Commandées"
          value={cnt("COMMANDEE")}
          color="green"
          active={statut === "COMMANDEE"}
        />
        <FilterTab
          href="/demandes?statut=REFUSEE"
          label="Refusées"
          value={cnt("REFUSEE")}
          color="red"
          active={statut === "REFUSEE"}
        />
      </div>

      {demandes.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={ShoppingCart}
              title="Aucune demande"
              description={
                me.isAdmin
                  ? "Quand un chef de chantier demande du matériel, il apparaîtra ici."
                  : "Tu peux demander du matériel pour ton chantier ; l'admin valide puis transforme en commande."
              }
              action={
                <Link href="/demandes/nouvelle">
                  <Button>
                    <Plus size={16} /> Faire une demande
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
              {demandes.map((d) => {
                const urgence = urgenceLabel[d.urgence];
                return (
                  <li key={d.id}>
                    <Link
                      href={`/demandes/${d.id}`}
                      className="flex items-start gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-900 transition"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-slate-900 dark:text-slate-100 line-clamp-2">
                            {d.description}
                          </span>
                          <DemandeStatutBadge statut={d.statut} />
                          {d.urgence !== "ATTENTION" && (
                            <Badge color={urgence.color}>
                              {urgence.label}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <span>
                            {Number(d.quantite)} {d.unite ?? ""}
                          </span>
                          <span>·</span>
                          <span className="text-brand-700 dark:text-brand-400">
                            {d.chantier.nom}
                          </span>
                          {d.fournisseur && (
                            <>
                              <span>·</span>
                              <span>{d.fournisseur}</span>
                            </>
                          )}
                          <span>·</span>
                          <span>{dateFmt.format(new Date(d.createdAt))}</span>
                          <span>·</span>
                          <span>par {d.requester.name}</span>
                        </div>
                      </div>
                      <ChevronRight
                        size={16}
                        className="text-slate-300 dark:text-slate-600 shrink-0 mt-1"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      )}

      {me.isAdmin && cnt("DEMANDEE") > 0 && !statut && (
        <Card className="mt-4 border-amber-200 dark:border-amber-900">
          <CardBody className="flex items-center gap-3 text-sm text-amber-800 dark:text-amber-300">
            <AlertCircle size={18} className="shrink-0" />
            <span>
              <strong>{cnt("DEMANDEE")}</strong> demande
              {cnt("DEMANDEE") > 1 ? "s" : ""} en attente de ta validation.
            </span>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function FilterTab({
  href,
  label,
  value,
  color,
  active,
}: {
  href: string;
  label: string;
  value: number;
  color: "yellow" | "blue" | "green" | "red";
  active: boolean;
}) {
  const colorMap = {
    yellow:
      "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400",
    blue: "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-400",
    green:
      "bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900 text-green-700 dark:text-green-400",
    red: "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-700 dark:text-red-400",
  };
  return (
    <Link
      href={href}
      className={`rounded-lg border p-2.5 ${colorMap[color]} ${active ? "ring-2 ring-offset-1 ring-current dark:ring-offset-slate-950" : ""}`}
    >
      <div className="text-[10px] uppercase tracking-wider opacity-80">
        {label}
      </div>
      <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
        {value}
      </div>
    </Link>
  );
}
