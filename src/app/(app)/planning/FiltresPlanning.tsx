"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type ValeursFiltres = {
  chantier: string;
  ouvrier: string;
  equipe: string;
  espace: string;
};

type OptionRef = { id: string; nom: string };
type OuvrierRef = { id: string; nom: string; prenom: string | null };

// Style unique et compact (charte slate) : la rangée d'outils du planning
// tient sur une seule ligne, les selects suivent en text-xs / py-1.5.
const SELECT_CLS =
  "rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs flex-1 sm:flex-none min-w-0";

/**
 * Barre de filtres du planning : chantier, ouvrier affecté, équipe et,
 * pour l'admin global en mode « toutes les entreprises », l'entreprise
 * (espace). Les valeurs vivent dans l'URL (query params GET) et sont
 * appliquées CÔTÉ SERVEUR par la page ; changer un select navigue
 * immédiatement (router.push) en conservant la vue courante.
 *
 * Anti-flash : un état local reflète tout de suite le choix (le select ne
 * doit pas paraître figé pendant la navigation) puis se resynchronise sur
 * les props quand l'URL a rattrapé (navigation arrière, Réinitialiser).
 */
export function FiltresPlanning({
  chantiers,
  ouvriers,
  equipes,
  espaces,
  valeurs,
  vue,
}: {
  chantiers: OptionRef[];
  ouvriers: OuvrierRef[];
  equipes: OptionRef[];
  /** null = filtre entreprise masqué (espace courant déjà sélectionné,
   *  ou utilisateur non admin global). */
  espaces: OptionRef[] | null;
  valeurs: ValeursFiltres;
  vue: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [locales, setLocales] = useState(valeurs);

  // Resynchronisation quand l'URL change par un autre chemin que ces
  // selects (lien Réinitialiser, navigation navigateur).
  const { chantier, ouvrier, equipe, espace } = valeurs;
  useEffect(() => {
    setLocales({ chantier, ouvrier, equipe, espace });
  }, [chantier, ouvrier, equipe, espace]);

  function appliquer(cle: keyof ValeursFiltres, valeur: string) {
    // Changer d'entreprise remet à zéro les filtres qui en dépendent :
    // garder un chantier / ouvrier / équipe d'une autre entreprise
    // donnerait silencieusement zéro tâche.
    const next: ValeursFiltres =
      cle === "espace"
        ? { chantier: "", ouvrier: "", equipe: "", espace: valeur }
        : { ...locales, [cle]: valeur };
    setLocales(next);
    const params = new URLSearchParams();
    if (vue) params.set("vue", vue);
    if (next.chantier) params.set("chantier", next.chantier);
    if (next.ouvrier) params.set("ouvrier", next.ouvrier);
    if (next.equipe) params.set("equipe", next.equipe);
    if (next.espace) params.set("espace", next.espace);
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `/planning?${qs}` : "/planning");
    });
  }

  // opacity ne s'applique pas à un display:contents : l'état d'attente
  // est porté par chaque select (transition douce pendant la navigation).
  const cls = `${SELECT_CLS} transition-opacity ${pending ? "opacity-60" : ""}`;

  return (
    <>
      {espaces && (
        <select
          aria-label="Filtrer par entreprise"
          aria-busy={pending}
          value={locales.espace}
          onChange={(e) => appliquer("espace", e.target.value)}
          className={cls}
        >
          <option value="">Toutes les entreprises</option>
          {espaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nom}
            </option>
          ))}
        </select>
      )}
      <select
        aria-label="Filtrer par chantier"
        aria-busy={pending}
        value={locales.chantier}
        onChange={(e) => appliquer("chantier", e.target.value)}
        className={cls}
      >
        <option value="">Tous les chantiers</option>
        {chantiers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nom}
          </option>
        ))}
      </select>
      <select
        aria-label="Filtrer par ouvrier affecté"
        aria-busy={pending}
        value={locales.ouvrier}
        onChange={(e) => appliquer("ouvrier", e.target.value)}
        className={cls}
      >
        <option value="">Tous les ouvriers</option>
        {ouvriers.map((o) => (
          <option key={o.id} value={o.id}>
            {o.prenom ? `${o.prenom} ${o.nom}` : o.nom}
          </option>
        ))}
      </select>
      <select
        aria-label="Filtrer par équipe"
        aria-busy={pending}
        value={locales.equipe}
        onChange={(e) => appliquer("equipe", e.target.value)}
        className={cls}
      >
        <option value="">Toutes les équipes</option>
        {equipes.map((eq) => (
          <option key={eq.id} value={eq.id}>
            {eq.nom}
          </option>
        ))}
      </select>
    </>
  );
}
