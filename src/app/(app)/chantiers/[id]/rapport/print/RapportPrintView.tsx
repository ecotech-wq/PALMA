"use client";

import {
  Printer,
  AlertTriangle,
  Package,
  FileText,
  PackageOpen,
  PackageCheck,
  ShoppingCart,
  MessageSquare,
  CheckCircle2,
  Truck,
  Flag,
  Image as ImageIcon,
} from "lucide-react";

type Row = {
  id: string;
  type: string;
  authorName: string | null;
  authorRole: string | null;
  texte: string | null;
  photos: string[];
  hiddenFromClient: boolean;
  time: string;
};

type Day = { key: string; label: string; rows: Row[] };

const TYPE_LABEL: Record<string, { label: string; Icon: typeof AlertTriangle }> = {
  NOTE: { label: "Note", Icon: MessageSquare },
  SYSTEM_INCIDENT: { label: "Incident", Icon: AlertTriangle },
  SYSTEM_INCIDENT_RESOLU: { label: "Incident résolu", Icon: CheckCircle2 },
  SYSTEM_DEMANDE: { label: "Demande matériel", Icon: Package },
  SYSTEM_COMMANDE: { label: "Commande", Icon: ShoppingCart },
  SYSTEM_COMMANDE_LIVREE: { label: "Commande livrée", Icon: PackageCheck },
  SYSTEM_RAPPORT: { label: "Rapport quotidien", Icon: FileText },
  SYSTEM_SORTIE: { label: "Sortie matériel", Icon: PackageOpen },
  SYSTEM_RETOUR: { label: "Retour matériel", Icon: PackageCheck },
  SYSTEM_LOCATION: { label: "Location", Icon: Truck },
  SYSTEM_LOCATION_FIN: { label: "Location restituée", Icon: Flag },
  SYSTEM_PLAN: { label: "Plan", Icon: ImageIcon },
  BILAN_JOURNEE: { label: "Bilan", Icon: FileText },
};

/**
 * Rapport compilé imprimable. Deux modes :
 *  - audience "equipe" : tous les messages (interne + client)
 *  - audience "client" : seulement les messages visibles client
 *
 * Mise en page identique au PV (A4, page-break, avoid-break).
 */
export function RapportPrintView({
  audience,
  chantier,
  period,
  stats,
  days,
}: {
  audience: "equipe" | "client";
  chantier: {
    nom: string;
    adresse: string | null;
    description: string | null;
    chefName: string | null;
    chefEmail: string | null;
    clients: { name: string; email: string }[];
  };
  period: { fromLabel: string; toLabel: string; editedLabel: string };
  stats: {
    total: number;
    photoCount: number;
    incidents: number;
    demandes: number;
    rapportsQuot: number;
    days: number;
  };
  days: Day[];
}) {
  const titleLabel =
    audience === "client" ? "Rapport client" : "Rapport d'équipe";

  return (
    <div className="rapport-print-view bg-white text-slate-900 max-w-4xl mx-auto p-6 print:p-0 text-[12px]">
      <style>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          body { background: white !important; }
          body * { visibility: hidden !important; }
          .rapport-print-view, .rapport-print-view * { visibility: visible !important; }
          .rapport-print-view { position: absolute; left: 0; top: 0; width: 100%; max-width: none !important; padding: 0 !important; margin: 0 !important; }
          .no-print { display: none !important; }
          .page-break { break-before: page; }
          .avoid-break { break-inside: avoid; }
        }
      `}</style>

      <div className="no-print mb-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-brand-600 text-white text-sm hover:bg-brand-700"
        >
          <Printer size={14} /> Imprimer / Enregistrer en PDF
        </button>
      </div>

      {/* === Page de garde === */}
      <header className="mb-8 avoid-break">
        <div className="border-b-4 border-slate-900 pb-3 mb-5">
          <p className="text-xs uppercase tracking-widest text-slate-500">
            {titleLabel}
          </p>
          <h1 className="text-3xl font-bold tracking-tight mt-1">
            {chantier.nom}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Période :{" "}
            <strong>
              {period.fromLabel} → {period.toLabel}
            </strong>{" "}
            — édité le {period.editedLabel}
          </p>
        </div>

        <section className="mb-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-2">
            Informations sur le chantier
          </h2>
          <table className="w-full border border-slate-300 text-sm">
            <tbody>
              {chantier.adresse && (
                <tr className="border-b border-slate-200">
                  <td className="bg-slate-50 px-3 py-1.5 font-medium w-1/3">
                    Adresse
                  </td>
                  <td className="px-3 py-1.5">{chantier.adresse}</td>
                </tr>
              )}
              {chantier.description && audience === "equipe" && (
                <tr className="border-b border-slate-200">
                  <td className="bg-slate-50 px-3 py-1.5 font-medium">
                    Description
                  </td>
                  <td className="px-3 py-1.5 whitespace-pre-wrap">
                    {chantier.description}
                  </td>
                </tr>
              )}
              <tr className="border-b border-slate-200">
                <td className="bg-slate-50 px-3 py-1.5 font-medium">
                  Conducteur de travaux
                </td>
                <td className="px-3 py-1.5">
                  {chantier.chefName ?? "—"}
                  {chantier.chefEmail && audience === "equipe" && (
                    <span className="text-slate-500 ml-2">
                      ({chantier.chefEmail})
                    </span>
                  )}
                </td>
              </tr>
              {chantier.clients.length > 0 && (
                <tr>
                  <td className="bg-slate-50 px-3 py-1.5 font-medium align-top">
                    Maître d&apos;ouvrage
                  </td>
                  <td className="px-3 py-1.5">
                    {chantier.clients.map((c, i) => (
                      <div key={i}>
                        {c.name}
                        {audience === "equipe" && (
                          <span className="text-slate-500 ml-1">
                            ({c.email})
                          </span>
                        )}
                      </div>
                    ))}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="mb-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-2">
            Synthèse de la période
          </h2>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Jours actifs" value={stats.days} />
            <Stat label="Événements" value={stats.total} />
            <Stat label="Photos" value={stats.photoCount} />
            <Stat label="Incidents" value={stats.incidents} />
            <Stat label="Demandes matériel" value={stats.demandes} />
            <Stat label="Rapports quotidiens" value={stats.rapportsQuot} />
          </div>
        </section>
      </header>

      {/* === Journal === */}
      {days.length === 0 ? (
        <section className="page-break">
          <h2 className="text-base font-bold mb-3 uppercase tracking-wide bg-slate-900 text-white px-3 py-1.5">
            Journal
          </h2>
          <p className="text-sm italic text-slate-500">
            Aucun événement à reporter sur cette période.
          </p>
        </section>
      ) : (
        days.map((d, idx) => (
          <section
            key={d.key}
            className={`${idx > 0 ? "page-break" : ""} mb-4`}
          >
            <h2 className="text-base font-bold mb-2 uppercase tracking-wide bg-slate-900 text-white px-3 py-1.5">
              {d.label}{" "}
              <span className="font-normal text-slate-300">
                · {d.rows.length} événement{d.rows.length > 1 ? "s" : ""}
              </span>
            </h2>
            <ul className="divide-y divide-slate-200 border border-slate-200">
              {d.rows.map((r) => (
                <EventRow key={r.id} row={r} showInternalTag={audience === "equipe"} />
              ))}
            </ul>
          </section>
        ))
      )}

      {/* === Pied de page === */}
      <footer className="mt-8 pt-3 border-t border-slate-300 text-[10px] text-slate-500 avoid-break">
        Rapport généré automatiquement depuis le fil de chantier ·{" "}
        {audience === "client"
          ? "Version client — messages internes filtrés."
          : "Version équipe — tous les messages, y compris internes."}
      </footer>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-slate-300 px-3 py-2 bg-slate-50">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="text-xl font-bold text-slate-900">{value}</div>
    </div>
  );
}

function EventRow({
  row,
  showInternalTag,
}: {
  row: Row;
  showInternalTag: boolean;
}) {
  const meta = TYPE_LABEL[row.type] ?? TYPE_LABEL.NOTE;
  const isTyped = row.type !== "NOTE";
  return (
    <li className="p-3 avoid-break">
      <div className="flex items-baseline gap-2 flex-wrap text-[11px] mb-1">
        <span className="font-mono text-slate-500 w-12 shrink-0">
          {row.time}
        </span>
        {isTyped && (
          <span className="inline-flex items-center gap-1 font-semibold text-slate-800 uppercase text-[10px] tracking-wider">
            <meta.Icon size={11} /> {meta.label}
          </span>
        )}
        <span className="text-slate-700 font-medium">
          {row.authorName ?? "Système"}
        </span>
        {showInternalTag && row.hiddenFromClient && (
          <span className="text-amber-700 italic text-[10px]">
            · interne (caché client)
          </span>
        )}
      </div>
      {row.texte && (
        <p className="text-sm text-slate-800 whitespace-pre-wrap leading-snug ml-14">
          {row.texte}
        </p>
      )}
      {row.photos.length > 0 && (
        <div className="ml-14 mt-2 grid grid-cols-3 gap-2">
          {row.photos.map((url, i) => (
            <div key={i} className="avoid-break">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Photo ${i + 1}`}
                className="block w-full h-32 object-cover border border-slate-300"
              />
            </div>
          ))}
        </div>
      )}
    </li>
  );
}
