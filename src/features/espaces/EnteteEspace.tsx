// ─── Entête d'entreprise pour les documents (charte LYNX) ────────────────────
// « La couleur d'un espace n'apparaît que sur son avatar, sa pastille dans le
// sélecteur et l'entête de ses documents. » Ce bandeau porte l'identité de
// l'ENTREPRISE émettrice sur les documents imprimables (PV, rapports) : un
// avatar à sa couleur, son nom, et un filet à sa couleur. Aucun composant
// système n'utilise cette couleur.

export function EnteteEspace({
  nom,
  couleur,
}: {
  nom: string;
  couleur?: string | null;
}) {
  const c = couleur ?? "#141414";
  const initiale = nom.trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      className="mb-4 flex items-center gap-3 border-b-4 pb-3"
      style={{ borderColor: c }}
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-base font-semibold text-white"
        style={{ backgroundColor: c }}
      >
        {initiale}
      </span>
      <div className="min-w-0">
        <p className="truncate text-lg font-semibold leading-tight text-slate-900">
          {nom}
        </p>
        <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">
          Document émis via LYNX
        </p>
      </div>
    </div>
  );
}
