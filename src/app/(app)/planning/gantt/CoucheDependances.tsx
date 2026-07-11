"use client";

/**
 * Couche SVG des dépendances du Gantt : flèches existantes (cliquables
 * pour sélection / suppression) et lien élastique pendant la création
 * d'une dépendance au geste (tirer depuis un port vers une barre cible).
 *
 * Le SVG lui-même est en pointer-events: none ; seuls les chemins de
 * sélection (trait invisible élargi, confortable au doigt) reçoivent
 * les clics. Pendant un tirage de lien, ces chemins sont désactivés
 * pour ne pas gêner la détection de la barre cible sous le doigt.
 */

export type FlecheDep = {
  /** Tâche qui dépend (pointe de la flèche). */
  tacheId: string;
  /** Prédécesseur (origine de la flèche). */
  depId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /** Conflit de planning : le prédécesseur non terminé finit après le début. */
  bloquante: boolean;
  /** Ajout optimiste pas encore confirmé par le serveur. */
  optimiste?: boolean;
};

export type LienElastique = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

/** Tracé en L : sortie horizontale, descente verticale, entrée horizontale. */
export function cheminFleche(a: FlecheDep): string {
  const midX =
    a.toX > a.fromX
      ? a.fromX + Math.max(8, (a.toX - a.fromX) / 2)
      : a.fromX + 12;
  return `M ${a.fromX} ${a.fromY} H ${midX} V ${a.toY} H ${a.toX}`;
}

/** Point médian du tracé, pour positionner le bouton de suppression. */
export function pointMilieuFleche(a: FlecheDep): { x: number; y: number } {
  const midX =
    a.toX > a.fromX
      ? a.fromX + Math.max(8, (a.toX - a.fromX) / 2)
      : a.fromX + 12;
  return { x: midX, y: (a.fromY + a.toY) / 2 };
}

export function CoucheDependances({
  fleches,
  left,
  width,
  height,
  selection,
  onSelect,
  clicsDesactives,
  lien,
  lienInvalide,
}: {
  fleches: FlecheDep[];
  left: number;
  width: number;
  height: number;
  /** Clé "tacheId|depId" de la flèche sélectionnée, ou null. */
  selection: string | null;
  /** Absent = lecture seule (pas de sélection possible). */
  onSelect?: (fleche: FlecheDep) => void;
  /** Vrai pendant un tirage de lien : les flèches ignorent le pointeur. */
  clicsDesactives: boolean;
  lien: LienElastique | null;
  lienInvalide: boolean;
}) {
  return (
    <svg
      className="absolute pointer-events-none z-[4]"
      style={{ left, top: 0, width, height }}
      aria-hidden="true"
    >
      <defs>
        <marker
          id="arrow-blocking"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="rgb(220 38 38)" />
        </marker>
        <marker
          id="arrow-ok"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="rgb(100 116 139)" />
        </marker>
        <marker
          id="arrow-lien"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="rgb(245 158 11)" />
        </marker>
        <marker
          id="arrow-lien-invalide"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="rgb(239 68 68)" />
        </marker>
      </defs>

      {fleches.map((a) => {
        const key = `${a.tacheId}|${a.depId}`;
        const selectionnee = selection === key;
        const stroke = a.bloquante ? "rgb(220 38 38)" : "rgb(100 116 139)";
        const marker = a.bloquante ? "url(#arrow-blocking)" : "url(#arrow-ok)";
        const dashed = a.bloquante ? "" : "4 3";
        const d = cheminFleche(a);
        return (
          <g key={key}>
            {/* Zone de clic élargie (14 px), invisible : sélection au
                doigt comme à la souris. */}
            {onSelect && (
              <path
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth={14}
                data-arrow-ui="1"
                style={{
                  pointerEvents: clicsDesactives ? "none" : "stroke",
                  cursor: "pointer",
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(a);
                }}
              />
            )}
            <path
              d={d}
              fill="none"
              stroke={stroke}
              strokeWidth={selectionnee ? 3 : 1.5}
              strokeDasharray={selectionnee ? "" : dashed}
              markerEnd={marker}
              opacity={
                a.optimiste ? 0.5 : selectionnee ? 1 : a.bloquante ? 0.9 : 0.6
              }
            />
          </g>
        );
      })}

      {/* Lien élastique pendant la création d'une dépendance */}
      {lien && (
        <path
          d={`M ${lien.x0} ${lien.y0} L ${lien.x1} ${lien.y1}`}
          fill="none"
          stroke={lienInvalide ? "rgb(239 68 68)" : "rgb(245 158 11)"}
          strokeWidth={2}
          strokeDasharray="5 4"
          markerEnd={
            lienInvalide ? "url(#arrow-lien-invalide)" : "url(#arrow-lien)"
          }
        />
      )}
    </svg>
  );
}
