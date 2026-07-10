// ─── Entête d'entreprise pour les documents (charte LYNX) ────────────────────
// « La couleur d'un espace n'apparaît que sur son avatar, sa pastille dans le
// sélecteur et l'entête de ses documents. » Ce bandeau porte l'identité de
// l'ENTREPRISE émettrice : logo (ou avatar à sa couleur), coordonnées (adresse,
// téléphone, email, SIRET) et filet à sa couleur.

export type EspaceEntete = {
  nom: string;
  couleur?: string | null;
  logoUrl?: string | null;
  adresse?: string | null;
  telephone?: string | null;
  email?: string | null;
  siret?: string | null;
};

export function EnteteEspace({ espace }: { espace: EspaceEntete }) {
  const c = espace.couleur ?? "#141414";
  const initiale = espace.nom.trim().charAt(0).toUpperCase() || "?";
  const coordonnees = [espace.telephone, espace.email].filter(Boolean).join(" · ");
  return (
    <div
      className="entete-espace mb-4 flex items-start justify-between gap-4 border-b-4 pb-3"
      style={{ borderColor: c }}
    >
      <div className="flex min-w-0 items-center gap-3">
        {espace.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={espace.logoUrl}
            alt={espace.nom}
            className="h-12 w-auto max-w-[160px] shrink-0 object-contain"
          />
        ) : (
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-base font-semibold text-white"
            style={{ backgroundColor: c }}
          >
            {initiale}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold leading-tight text-slate-900">
            {espace.nom}
          </p>
          <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">
            Document émis via LYNX
          </p>
        </div>
      </div>
      <div className="shrink-0 text-right text-[11px] leading-relaxed text-slate-600">
        {espace.adresse && <p className="max-w-[240px]">{espace.adresse}</p>}
        {coordonnees && <p>{coordonnees}</p>}
        {espace.siret && <p>SIRET {espace.siret}</p>}
      </div>
    </div>
  );
}
