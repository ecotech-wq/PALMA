"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserMinus, UserPlus } from "lucide-react";
import { useToast } from "@/components/Toast";
import {
  addChantierMembre,
  removeChantierMembre,
} from "../server/membre-actions";

/**
 * Équipe du chantier (v4.3) : liste des membres par rôle, ajout et
 * retrait. Rendue dans la fiche chantier. Les boutons de gestion ne
 * s'affichent que pour un gestionnaire (admin ou conducteur membre) ;
 * la vérification qui compte reste côté serveur.
 */

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrateur",
  CONDUCTEUR: "Conducteur de travaux",
  CHEF: "Chef de chantier",
  OUVRIER: "Ouvrier",
  SOUS_TRAITANT: "Sous-traitant",
  CLIENT: "Client",
};

type Membre = { userId: string; nom: string; role: string };
type Invitable = { id: string; name: string; role: string };

export function MembresCard({
  chantierId,
  membres,
  invitables,
  canManage,
}: {
  chantierId: string;
  membres: Membre[];
  invitables: Invitable[];
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [selection, setSelection] = useState("");

  function ajouter() {
    if (!selection) return;
    startTransition(async () => {
      try {
        await addChantierMembre(chantierId, selection);
        setSelection("");
        toast.success("Membre ajouté au chantier");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  function retirer(userId: string, nom: string) {
    if (!confirm(`Retirer ${nom} du chantier (et de tous ses canaux) ?`)) return;
    startTransition(async () => {
      try {
        await removeChantierMembre(chantierId, userId);
        toast.success("Membre retiré");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  return (
    <div className="space-y-3">
      {membres.length === 0 ? (
        <p className="text-sm italic text-slate-500 dark:text-slate-400">
          Personne n&apos;est encore membre de ce chantier.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {membres.map((m) => (
            <li key={m.userId} className="flex items-center gap-2 py-1.5">
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm text-slate-800 dark:text-slate-200">
                  {m.nom}
                </span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  {ROLE_LABEL[m.role] ?? m.role}
                </span>
              </div>
              {canManage && (
                <button
                  type="button"
                  onClick={() => retirer(m.userId, m.nom)}
                  disabled={pending}
                  title="Retirer du chantier"
                  className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 disabled:opacity-50"
                >
                  <UserMinus size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && invitables.length > 0 && (
        <div className="flex items-center gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
          <select
            value={selection}
            onChange={(e) => setSelection(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm"
          >
            <option value="">Inviter une personne...</option>
            {invitables.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({ROLE_LABEL[u.role] ?? u.role})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={ajouter}
            disabled={pending || !selection}
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1.5 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <UserPlus size={14} /> Ajouter
          </button>
        </div>
      )}
    </div>
  );
}
