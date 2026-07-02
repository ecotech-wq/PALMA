import {
  CalendarDays,
  ClipboardCheck,
  FileText,
  Map as MapIcon,
} from "lucide-react";

/**
 * Documents d'un chantier accessibles depuis sa messagerie. Source
 * unique pour le rail de gauche (grand écran) et la feuille d'infos
 * (téléphone) : une entrée ajoutée ici apparaît aux deux endroits.
 */
export function documentsChantier(chantierId: string) {
  return [
    {
      href: `/rapports?chantier=${chantierId}`,
      label: "Rapports quotidiens",
      Icon: FileText,
    },
    {
      href: "/rapports-hebdo",
      label: "Rapports hebdomadaires",
      Icon: CalendarDays,
    },
    { href: "/pv-reception", label: "PV de réception", Icon: ClipboardCheck },
    { href: "/plans", label: "Plans", Icon: MapIcon },
  ];
}
