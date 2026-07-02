import Link from "next/link";

/**
 * Le mur du terrain : les dernières photos postées dans les canaux des
 * chantiers, en bande défilante. C'est la partie vivante de l'accueil :
 * l'état réel du terrain en une seconde, sans un chiffre. Chaque photo
 * ramène à la conversation d'où elle vient.
 */
export type PhotoTerrain = {
  url: string;
  chantierNom: string;
  href: string;
};

export function MurDuTerrain({
  photos,
  titre,
}: {
  photos: PhotoTerrain[];
  titre: string;
}) {
  if (photos.length === 0) return null;
  return (
    <section aria-label={titre}>
      <div className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
        {titre}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1.5 -mx-1 px-1">
        {photos.map((p, i) => (
          <Link
            key={`${p.url}-${i}`}
            href={p.href}
            className="group relative h-24 w-32 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800"
            title={`Ouvrir la conversation (${p.chantierNom})`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.url}
              alt={`Photo du chantier ${p.chantierNom}`}
              loading="lazy"
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
            <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-3 text-[10px] font-medium text-white">
              {p.chantierNom}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
