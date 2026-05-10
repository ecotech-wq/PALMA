import Link from "next/link";
import { CalendarCheck, Users, AlertCircle, ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

/**
 * Widget "Aujourd'hui" : un coup d'œil immédiat sur ce qui se passe
 * actuellement.
 *
 * - Combien d'ouvriers sont pointés aujourd'hui
 * - Sur quels chantiers / quelles équipes
 * - Qui n'a pas pointé alors qu'il a une équipe affectée
 */
export async function TodayWidget() {
  const today = new Date();
  const dayStart = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  );
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const [pointages, ouvriersActifs] = await Promise.all([
    db.pointage.findMany({
      where: { date: { gte: dayStart, lt: dayEnd } },
      include: {
        ouvrier: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            equipe: {
              select: {
                id: true,
                nom: true,
                chantier: { select: { id: true, nom: true } },
              },
            },
          },
        },
        chantier: { select: { id: true, nom: true } },
      },
    }),
    db.ouvrier.findMany({
      where: { actif: true },
      select: {
        id: true,
        nom: true,
        prenom: true,
        equipe: {
          select: {
            id: true,
            nom: true,
            chantier: { select: { id: true, nom: true } },
          },
        },
      },
    }),
  ]);

  // Total jours-homme aujourd'hui
  const totalJours = pointages.reduce(
    (s, p) => s + Number(p.joursTravailles),
    0
  );

  // Groupement par chantier (du pointage en priorité, sinon de l'équipe)
  type Group = {
    chantierId: string | null;
    chantierNom: string;
    ouvriers: { id: string; nom: string; jours: number }[];
  };
  const groups = new Map<string, Group>();
  for (const p of pointages) {
    if (Number(p.joursTravailles) <= 0) continue;
    const chId = p.chantier?.id ?? p.ouvrier.equipe?.chantier?.id ?? null;
    const chNom =
      p.chantier?.nom ??
      p.ouvrier.equipe?.chantier?.nom ??
      "Sans chantier";
    const key = chId ?? "_none";
    if (!groups.has(key)) {
      groups.set(key, { chantierId: chId, chantierNom: chNom, ouvriers: [] });
    }
    groups
      .get(key)!
      .ouvriers.push({
        id: p.ouvrier.id,
        nom: [p.ouvrier.prenom, p.ouvrier.nom].filter(Boolean).join(" "),
        jours: Number(p.joursTravailles),
      });
  }
  const groupedArray = Array.from(groups.values()).sort((a, b) =>
    a.chantierNom.localeCompare(b.chantierNom)
  );

  // Qui n'a pas pointé : ouvriers actifs avec équipe sur chantier en cours
  // qui n'ont aucun pointage aujourd'hui
  const pointesIds = new Set(pointages.map((p) => p.ouvrier.id));
  const nonPointes = ouvriersActifs.filter(
    (o) => o.equipe?.chantier && !pointesIds.has(o.id)
  );

  const todayLabel = today.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <Card className="mb-5">
      <CardHeader className="flex items-center justify-between gap-2 flex-wrap">
        <CardTitle className="flex items-center gap-2">
          <CalendarCheck size={18} className="text-brand-600" />
          Aujourd&apos;hui
          <span className="text-xs font-normal text-slate-500 dark:text-slate-400 capitalize">
            — {todayLabel}
          </span>
        </CardTitle>
        <div className="flex items-center gap-2">
          <Link
            href={`/pointage`}
            className="text-xs text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
          >
            Saisir le pointage <ArrowRight size={12} />
          </Link>
        </div>
      </CardHeader>
      <CardBody>
        {/* Stats compactes */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <Stat
            label="Pointés"
            value={pointesIds.size}
            sub={`${totalJours} j-h`}
            color="green"
          />
          <Stat
            label="Manquants"
            value={nonPointes.length}
            sub={
              nonPointes.length > 0 ? "à vérifier" : "Tous pointés"
            }
            color={nonPointes.length > 0 ? "amber" : "slate"}
          />
          <Stat
            label="Chantiers actifs"
            value={groupedArray.filter((g) => g.chantierId).length}
            sub="aujourd'hui"
            color="blue"
          />
        </div>

        {groupedArray.length === 0 ? (
          <div className="text-sm text-slate-500 dark:text-slate-400 italic text-center py-3">
            Personne n&apos;a encore pointé aujourd&apos;hui.
          </div>
        ) : (
          <div className="space-y-3">
            {groupedArray.map((g) => (
              <div
                key={g.chantierId ?? "_none"}
                className="border-l-2 border-brand-200 dark:border-brand-800 pl-3"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  {g.chantierId ? (
                    <Link
                      href={`/chantiers/${g.chantierId}`}
                      className="font-medium text-slate-900 dark:text-slate-100 hover:text-brand-600 truncate"
                    >
                      {g.chantierNom}
                    </Link>
                  ) : (
                    <span className="font-medium text-slate-500 dark:text-slate-400 italic truncate">
                      {g.chantierNom}
                    </span>
                  )}
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                    {g.ouvriers.length} ouvrier
                    {g.ouvriers.length > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {g.ouvriers.map((o) => (
                    <Link
                      key={o.id}
                      href={`/ouvriers/${o.id}`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-50 dark:bg-green-950/40 text-green-800 dark:text-green-300 text-[11px] hover:bg-green-100 dark:hover:bg-green-900/60"
                    >
                      <Users size={10} />
                      {o.nom}
                      {o.jours !== 1 && (
                        <span className="text-[10px] opacity-75">
                          ({o.jours === 0.5 ? "½j" : `${o.jours}j`})
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {nonPointes.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-500 mb-2">
              <AlertCircle size={12} />
              <span className="font-medium">
                {nonPointes.length} ouvrier{nonPointes.length > 1 ? "s" : ""}{" "}
                non pointé{nonPointes.length > 1 ? "s" : ""}
              </span>
              <span className="text-slate-500 dark:text-slate-400">
                (mais affecté{nonPointes.length > 1 ? "s" : ""} à un chantier en cours)
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {nonPointes.slice(0, 8).map((o) => {
                const fullName = [o.prenom, o.nom].filter(Boolean).join(" ");
                return (
                  <Link
                    key={o.id}
                    href={`/ouvriers/${o.id}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-400 text-[11px] hover:bg-amber-100"
                    title={`${o.equipe?.chantier?.nom ?? ""}`}
                  >
                    {fullName}
                  </Link>
                );
              })}
              {nonPointes.length > 8 && (
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  +{nonPointes.length - 8} autres…
                </span>
              )}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function Stat({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: number;
  sub: string;
  color: "green" | "amber" | "blue" | "slate";
}) {
  const map = {
    green:
      "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400",
    amber:
      "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400",
    blue: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400",
    slate:
      "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300",
  };
  return (
    <div className={`rounded-lg p-2 ${map[color]}`}>
      <div className="text-[10px] uppercase tracking-wider font-medium opacity-80">
        {label}
      </div>
      <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
        {value}
      </div>
      <div className="text-[10px] opacity-80 truncate">{sub}</div>
    </div>
  );
}
