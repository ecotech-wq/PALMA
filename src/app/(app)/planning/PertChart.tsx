import { computePert, type PertTaskInput, type PertTaskResult } from "@/lib/pert";
import { cn } from "@/lib/utils";

type Tache = {
  id: string;
  nom: string;
  dateDebut: Date;
  dateFin: Date;
  avancement: number;
  statut: string;
  equipe: { nom: string } | null;
  chantier: { nom: string };
  dependances: { id: string }[];
};

const NODE_W = 200;
const NODE_H = 120;
const COL_GAP = 80;
const ROW_GAP = 32;
const PADDING = 16;

function fmtDate(d: Date): string {
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

export function PertChart({ taches }: { taches: Tache[] }) {
  if (taches.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-10 text-center text-sm text-slate-500 dark:text-slate-500">
        Aucune tâche. Crée des tâches avec leurs dépendances pour visualiser le diagramme PERT.
      </div>
    );
  }

  // Build PERT input
  const inputs: PertTaskInput[] = taches.map((t) => ({
    id: t.id,
    nom: t.nom,
    dateDebut: t.dateDebut,
    dateFin: t.dateFin,
    dependances: t.dependances.map((d) => d.id),
  }));

  let pert;
  try {
    pert = computePert(inputs);
  } catch (e) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-red-200 p-6 text-center text-sm text-red-700">
        Impossible de calculer le PERT : {e instanceof Error ? e.message : "erreur"}.
        Vérifie les dépendances (cycle possible).
      </div>
    );
  }

  const totalDeps = inputs.reduce((s, t) => s + t.dependances.length, 0);
  const noDepsHint = totalDeps === 0 && taches.length >= 2;

  // Layout : assigner une position (col, row) à chaque tâche
  const positions = new Map<string, { x: number; y: number }>();
  pert.niveaux.forEach((ids, level) => {
    ids.forEach((id, row) => {
      positions.set(id, {
        x: PADDING + level * (NODE_W + COL_GAP),
        y: PADDING + row * (NODE_H + ROW_GAP),
      });
    });
  });

  const totalCols = pert.niveaux.length;
  const maxRows = Math.max(...pert.niveaux.map((n) => n.length), 1);
  const svgWidth = PADDING * 2 + totalCols * NODE_W + (totalCols - 1) * COL_GAP;
  const svgHeight = PADDING * 2 + maxRows * NODE_H + (maxRows - 1) * ROW_GAP;

  const taskMeta = new Map<string, Tache>();
  taches.forEach((t) => taskMeta.set(t.id, t));
  const pertById = new Map<string, PertTaskResult>();
  pert.taches.forEach((p) => pertById.set(p.id, p));
  const critiqueSet = new Set(pert.cheminCritique);

  return (
    <div className="space-y-3">
      {noDepsHint && (
        <div className="rounded-xl border border-accent-200 bg-accent-50 px-4 py-3 text-sm text-accent-800 flex items-start gap-3">
          <span className="text-lg leading-none">💡</span>
          <div>
            <p className="font-medium">Aucune dépendance définie entre tes tâches.</p>
            <p className="text-accent-700 mt-0.5">
              Le diagramme PERT révèle ses chemins critiques quand les tâches sont enchaînées.
              Passe en vue <strong>Liste</strong>, clique l&apos;icône ✏️ sur une tâche, puis indique
              dans <em>« Dépend de »</em> les tâches qui doivent être terminées avant.
            </p>
          </div>
        </div>
      )}
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: "75vh" }}>
        <svg
          width={svgWidth}
          height={svgHeight}
          style={{ display: "block" }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
            </marker>
            <marker
              id="arrow-critical"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#dc2626" />
            </marker>
          </defs>

          {/* Arrows */}
          {pert.taches.map((p) =>
            p.dependances.map((depId) => {
              const fromPos = positions.get(depId);
              const toPos = positions.get(p.id);
              if (!fromPos || !toPos) return null;
              const x1 = fromPos.x + NODE_W;
              const y1 = fromPos.y + NODE_H / 2;
              const x2 = toPos.x;
              const y2 = toPos.y + NODE_H / 2;
              const midX = (x1 + x2) / 2;
              const isCritical = critiqueSet.has(depId) && critiqueSet.has(p.id);
              return (
                <path
                  key={`${depId}-${p.id}`}
                  d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2 - 6} ${y2}`}
                  stroke={isCritical ? "#dc2626" : "#94a3b8"}
                  strokeWidth={isCritical ? 2.5 : 1.5}
                  fill="none"
                  markerEnd={`url(#${isCritical ? "arrow-critical" : "arrow"})`}
                />
              );
            })
          )}

          {/* Nodes */}
          {pert.taches.map((p) => {
            const pos = positions.get(p.id)!;
            const meta = taskMeta.get(p.id)!;
            const isCritical = p.critical;
            return (
              <g key={p.id} transform={`translate(${pos.x}, ${pos.y})`}>
                <rect
                  x={0}
                  y={0}
                  width={NODE_W}
                  height={NODE_H}
                  rx={8}
                  fill="white"
                  stroke={isCritical ? "#dc2626" : "#cbd5e1"}
                  strokeWidth={isCritical ? 2.5 : 1.5}
                />
                {/* Header bar with task name */}
                <rect
                  x={0}
                  y={0}
                  width={NODE_W}
                  height={28}
                  rx={8}
                  fill={isCritical ? "#fee2e2" : "#f1f5f9"}
                />
                <rect
                  x={0}
                  y={20}
                  width={NODE_W}
                  height={8}
                  fill={isCritical ? "#fee2e2" : "#f1f5f9"}
                />
                <text
                  x={NODE_W / 2}
                  y={18}
                  textAnchor="middle"
                  className="fill-slate-900 text-sm font-semibold"
                  style={{ fontSize: 13, fontWeight: 600 }}
                >
                  {p.nom.length > 24 ? p.nom.slice(0, 22) + "…" : p.nom}
                </text>

                {/* ES / EF row */}
                <text
                  x={10}
                  y={48}
                  className="fill-slate-500"
                  style={{ fontSize: 10 }}
                >
                  ES {fmtDate(p.ES)}
                </text>
                <text
                  x={NODE_W - 10}
                  y={48}
                  textAnchor="end"
                  className="fill-slate-500"
                  style={{ fontSize: 10 }}
                >
                  EF {fmtDate(p.EF)}
                </text>

                {/* Duration in middle */}
                <text
                  x={NODE_W / 2}
                  y={70}
                  textAnchor="middle"
                  className="fill-slate-700"
                  style={{ fontSize: 14, fontWeight: 600 }}
                >
                  {p.dureeJours} j
                </text>

                {/* Equipe */}
                {meta.equipe && (
                  <text
                    x={NODE_W / 2}
                    y={86}
                    textAnchor="middle"
                    className="fill-slate-500"
                    style={{ fontSize: 10 }}
                  >
                    {meta.equipe.nom.length > 22
                      ? meta.equipe.nom.slice(0, 20) + "…"
                      : meta.equipe.nom}
                  </text>
                )}

                {/* LS / LF + slack row */}
                <text
                  x={10}
                  y={NODE_H - 8}
                  className="fill-slate-400"
                  style={{ fontSize: 10 }}
                >
                  LS {fmtDate(p.LS)}
                </text>
                <text
                  x={NODE_W / 2}
                  y={NODE_H - 8}
                  textAnchor="middle"
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    fill: isCritical ? "#dc2626" : "#16a34a",
                  }}
                >
                  marge {p.slack}j
                </text>
                <text
                  x={NODE_W - 10}
                  y={NODE_H - 8}
                  textAnchor="end"
                  className="fill-slate-400"
                  style={{ fontSize: 10 }}
                >
                  LF {fmtDate(p.LF)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex items-center gap-4 px-4 py-3 border-t border-slate-100 bg-slate-50 dark:bg-slate-900 text-xs text-slate-600 dark:text-slate-500 flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded border-2 border-red-600" />
          Tâche sur le chemin critique
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded border border-slate-300 dark:border-slate-700" />
          Tâche avec marge
        </span>
        {pert.finProjet && (
          <span className="ml-auto text-slate-700 dark:text-slate-300 font-medium">
            Fin projet : {pert.finProjet.toLocaleDateString("fr-FR")}
          </span>
        )}
      </div>

      <div className={cn("px-4 py-2 text-[11px] text-slate-500 dark:text-slate-500 border-t border-slate-100")}>
        Les tâches sans dépendance commencent à leur dateDebut. Les dépendances décalent
        le démarrage au plus tôt. La marge (slack) indique de combien de jours une tâche peut
        glisser sans impacter la fin du projet.
      </div>
    </div>
    </div>
  );
}
