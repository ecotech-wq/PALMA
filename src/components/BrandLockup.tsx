import Image from "next/image";

/**
 * Logo Autonhome présenté verticalement (logo + nom + tagline).
 * Utilisé sur les pages publiques (login, register).
 */
export function BrandLockup({ tagline = "Gestion de chantier" }: { tagline?: string }) {
  return (
    <div className="flex flex-col items-center text-center mb-6">
      <Image
        src="/brand/logo-icon.webp"
        alt="Autonhome"
        width={64}
        height={64}
        className="rounded-lg shrink-0 bg-white shadow-sm"
        priority
      />
      <div className="mt-3 text-2xl font-bold text-brand-700 dark:text-brand-700 tracking-tight">
        Autonhome
      </div>
      <div className="text-xs text-accent-600 dark:text-accent-400 italic mt-0.5">
        Concept solution, Inspired by Nature
      </div>
      <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">{tagline}</div>
    </div>
  );
}
