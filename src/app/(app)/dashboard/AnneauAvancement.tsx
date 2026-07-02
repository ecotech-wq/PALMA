/**
 * Anneau d'avancement (SVG pur, rendu serveur). Un pixel de couleur =
 * une information : l'arc représente le pourcentage moyen d'avancement
 * des tâches du chantier. Aucune dépendance, réutilisable partout.
 */
export function AnneauAvancement({
  pct,
  size = 40,
}: {
  /** 0..100, ou null si le chantier n'a pas encore de tâches. */
  pct: number | null;
  size?: number;
}) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const value = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  const done = value >= 100;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={pct === null ? "Avancement inconnu" : `Avancement ${Math.round(value)} %`}
      className="shrink-0 -rotate-90"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth="4"
        className="stroke-slate-200 dark:stroke-slate-700"
      />
      {pct !== null && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value / 100)}
          className={done ? "stroke-emerald-500" : "stroke-brand-500"}
        />
      )}
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        className="rotate-90 fill-slate-700 dark:fill-slate-200"
        style={{ fontSize: size * 0.26, fontWeight: 700, transformOrigin: "center" }}
      >
        {pct === null ? "–" : `${Math.round(value)}%`}
      </text>
    </svg>
  );
}
