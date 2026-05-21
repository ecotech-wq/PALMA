import Link from "next/link";
import {
  Plus,
  ClipboardList,
  Package,
  AlertTriangle,
  MessageSquare,
  Wrench,
  Banknote,
  ShoppingCart,
} from "lucide-react";

/**
 * Bandeau d'actions rapides en haut du dashboard. Les boutons varient
 * selon le rôle pour ne pas exposer ce que l'utilisateur n'a pas le
 * droit de faire.
 *
 *  - CHEF       : Pointage, Demander matériel, Signaler incident, Messagerie
 *  - CONDUCTEUR : + Nouvelle commande, Nouveau matériel
 *  - ADMIN      : + Nouveau chantier, Générer paie
 */
export function QuickActionsBar({
  isAdmin,
  isConducteur,
  isChef,
}: {
  isAdmin: boolean;
  isConducteur: boolean;
  isChef: boolean;
}) {
  type Action = {
    label: string;
    href: string;
    Icon: typeof Plus;
    color: string;
    show: boolean;
  };

  const canPilot = isAdmin || isConducteur;

  const actions: Action[] = [
    {
      label: "Pointage",
      href: "/pointage",
      Icon: ClipboardList,
      color: "bg-brand-600 hover:bg-brand-700 text-white",
      show: true,
    },
    {
      label: "Messagerie",
      href: "/messagerie",
      Icon: MessageSquare,
      color:
        "bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800",
      show: true,
    },
    {
      label: "Demander matériel",
      href: "/demandes/nouvelle",
      Icon: Package,
      color:
        "bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800",
      show: true,
    },
    {
      label: "Signaler incident",
      href: "/incidents/nouveau",
      Icon: AlertTriangle,
      color:
        "bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-900 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40",
      show: true,
    },
    {
      label: "Nouvelle commande",
      href: "/commandes/nouvelle",
      Icon: ShoppingCart,
      color:
        "bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800",
      show: canPilot,
    },
    {
      label: "Nouveau matériel",
      href: "/materiel/nouveau",
      Icon: Wrench,
      color:
        "bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800",
      show: canPilot,
    },
    {
      label: "Nouveau chantier",
      href: "/chantiers/nouveau",
      Icon: Plus,
      color:
        "bg-white dark:bg-slate-900 border border-brand-300 dark:border-brand-900 text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-950/40",
      show: isAdmin,
    },
    {
      label: "Générer paie",
      href: "/paie/nouveau",
      Icon: Banknote,
      color:
        "bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800",
      show: isAdmin,
    },
  ];

  const visible = actions.filter((a) => a.show);
  // Évite l'avertissement de variable non utilisée
  void isChef;

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
      {visible.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition snap-start ${a.color}`}
        >
          <a.Icon size={14} />
          {a.label}
        </Link>
      ))}
    </div>
  );
}
