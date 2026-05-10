"use client";

import { Printer } from "lucide-react";

type ReserveRow = {
  numero: number;
  texte: string;
  zone: string | null;
  lot: string | null;
  photos: string[];
  hasPin: boolean;
  posX: number | null;
  posY: number | null;
  dateLimite: string | null;
  leveLe: string | null;
};

type Group = {
  plan: { id: string; url: string; nom: string | null };
  reserves: ReserveRow[];
};

type PhotoEntry = {
  url: string;
  numero: number;
  lot: string | null;
  texte: string;
  planNom: string | null;
};

/**
 * Mise en page imprimable type OPR / Archipad :
 *  - Page de garde
 *  - Une section par plan : image (avec puces) puis tableau récap
 *  - Réserves sans plan : tableau seul
 *  - Annexe photos : grille 3 colonnes, légendées
 *  - Signatures
 */
export function PvPrintView({
  chantier,
  pv,
  groups,
  sansPlan,
  photosAnnex,
}: {
  chantier: {
    nom: string;
    adresse: string | null;
    description: string | null;
    chefName: string | null;
    chefEmail: string | null;
    clients: { name: string; email: string }[];
  };
  pv: {
    dateReception: string;
    dateRapport: string;
    texteRecap: string | null;
    statut: string;
    nbReserves: number;
    nbReservesLevees: number;
    signatureAdminUrl: string | null;
    signatureAdminLe: string | null;
    signatureClientUrl: string | null;
    signatureClientLe: string | null;
    reservesLeveeUrl: string | null;
    reservesLeveeLe: string | null;
  };
  groups: Group[];
  sansPlan: ReserveRow[];
  photosAnnex: PhotoEntry[];
}) {
  return (
    <div className="pv-print-view bg-white text-slate-900 max-w-4xl mx-auto p-6 print:p-0 text-[12px]">
      <style>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          body { background: white !important; }
          body * { visibility: hidden !important; }
          .pv-print-view, .pv-print-view * { visibility: visible !important; }
          .pv-print-view { position: absolute; left: 0; top: 0; width: 100%; max-width: none !important; padding: 0 !important; margin: 0 !important; }
          .no-print { display: none !important; }
          .page-break { break-before: page; }
          .avoid-break { break-inside: avoid; }
        }
      `}</style>

      <div className="no-print mb-4 flex justify-end">
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
            Procès-verbal de réception
          </p>
          <h1 className="text-3xl font-bold tracking-tight mt-1">
            {chantier.nom}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Date de réception :{" "}
            <strong>{pv.dateReception}</strong> — Rapport édité le{" "}
            {pv.dateRapport}
          </p>
        </div>

        <section className="mb-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-2">
            Informations sur le projet
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
              {chantier.description && (
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
                  {chantier.chefEmail && (
                    <span className="text-slate-500 ml-2">
                      ({chantier.chefEmail})
                    </span>
                  )}
                </td>
              </tr>
              {chantier.clients.length > 0 && (
                <tr className="border-b border-slate-200">
                  <td className="bg-slate-50 px-3 py-1.5 font-medium align-top">
                    Maître d&apos;ouvrage
                  </td>
                  <td className="px-3 py-1.5">
                    {chantier.clients.map((c, i) => (
                      <div key={i}>
                        {c.name}{" "}
                        <span className="text-slate-500">({c.email})</span>
                      </div>
                    ))}
                  </td>
                </tr>
              )}
              <tr>
                <td className="bg-slate-50 px-3 py-1.5 font-medium">
                  Réserves
                </td>
                <td className="px-3 py-1.5">
                  <strong>{pv.nbReserves}</strong> au total —{" "}
                  <span className="text-green-700 font-medium">
                    {pv.nbReservesLevees} levée(s)
                  </span>{" "}
                  / {pv.nbReserves - pv.nbReservesLevees} en attente
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {pv.texteRecap && (
          <section className="mb-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-2">
              Récapitulatif
            </h2>
            <p className="text-sm whitespace-pre-wrap">{pv.texteRecap}</p>
          </section>
        )}
      </header>

      {/* === Sections par plan : image + tableau récap === */}
      {groups.map((g) => (
        <section
          key={g.plan.id}
          className="page-break mb-6 avoid-break"
        >
          <h2 className="text-base font-bold mb-2 uppercase tracking-wide bg-slate-900 text-white px-3 py-1.5">
            Plan : {g.plan.nom || "Sans nom"} —{" "}
            <span className="font-normal">
              {g.reserves.length} réserve{g.reserves.length > 1 ? "s" : ""}
            </span>
          </h2>

          {/* Image du plan + puces */}
          <div className="relative inline-block max-w-full border border-slate-300 mb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={g.plan.url}
              alt={g.plan.nom || "Plan"}
              className="block max-w-full h-auto"
            />
            {g.reserves
              .filter((r) => r.hasPin)
              .map((r) => (
                <div
                  key={r.numero}
                  className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                  style={{
                    left: `${(r.posX ?? 0) * 100}%`,
                    top: `${(r.posY ?? 0) * 100}%`,
                  }}
                >
                  <div
                    className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold border-2 ${
                      r.leveLe
                        ? "bg-green-500 border-green-700 text-white"
                        : "bg-red-500 border-red-700 text-white"
                    }`}
                  >
                    {r.numero}
                  </div>
                </div>
              ))}
          </div>

          {g.reserves.length > 0 ? (
            <ReservesTable reserves={g.reserves} />
          ) : (
            <p className="text-xs italic text-slate-500">
              Aucune réserve sur ce plan.
            </p>
          )}
        </section>
      ))}

      {/* === Réserves sans plan === */}
      {sansPlan.length > 0 && (
        <section className="page-break mb-6 avoid-break">
          <h2 className="text-base font-bold mb-2 uppercase tracking-wide bg-slate-900 text-white px-3 py-1.5">
            Réserves sans plan —{" "}
            <span className="font-normal">{sansPlan.length}</span>
          </h2>
          <ReservesTable reserves={sansPlan} />
        </section>
      )}

      {/* === Annexe photos === */}
      {photosAnnex.length > 0 && (
        <section className="page-break">
          <h2 className="text-base font-bold mb-3 uppercase tracking-wide bg-slate-900 text-white px-3 py-1.5">
            Annexe — Photos ({photosAnnex.length})
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {photosAnnex.map((p, i) => (
              <div key={i} className="avoid-break">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt={`Photo réserve ${p.numero}`}
                  className="block w-full h-40 object-cover border border-slate-300"
                />
                <div className="mt-1 text-[10px] leading-snug">
                  <strong className="text-slate-900">
                    #{p.numero}
                    {p.planNom && ` · ${p.planNom}`}
                    {p.lot && ` · Lot ${p.lot}`}
                  </strong>
                  <p className="text-slate-700 line-clamp-2">{p.texte}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* === Signatures === */}
      <section className="page-break mt-8 avoid-break">
        <h2 className="text-base font-bold mb-3 uppercase tracking-wide bg-slate-900 text-white px-3 py-1.5">
          Signatures
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="border border-slate-300 p-3 min-h-[140px]">
            <div className="text-xs uppercase text-slate-500 mb-1 font-semibold">
              Maître d&apos;œuvre
            </div>
            {pv.signatureAdminUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pv.signatureAdminUrl}
                  alt="Signature admin"
                  className="max-h-24"
                />
                {pv.signatureAdminLe && (
                  <p className="text-[10px] text-slate-600 mt-1">
                    Le {pv.signatureAdminLe}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs italic text-slate-400">Non signé</p>
            )}
          </div>
          <div className="border border-slate-300 p-3 min-h-[140px]">
            <div className="text-xs uppercase text-slate-500 mb-1 font-semibold">
              Maître d&apos;ouvrage / Client
            </div>
            {pv.signatureClientUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pv.signatureClientUrl}
                  alt="Signature client"
                  className="max-h-24"
                />
                {pv.signatureClientLe && (
                  <p className="text-[10px] text-slate-600 mt-1">
                    Le {pv.signatureClientLe}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs italic text-slate-400">Non signé</p>
            )}
          </div>
        </div>
        {pv.reservesLeveeUrl && (
          <div className="mt-4 border border-slate-300 p-3">
            <div className="text-xs uppercase text-slate-500 mb-1 font-semibold">
              Signature de levée des réserves (client)
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pv.reservesLeveeUrl}
              alt="Signature levée"
              className="max-h-24"
            />
            {pv.reservesLeveeLe && (
              <p className="text-[10px] text-slate-600 mt-1">
                Le {pv.reservesLeveeLe}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

/* ---------- Tableau récap d'un groupe ---------- */
function ReservesTable({ reserves }: { reserves: ReserveRow[] }) {
  return (
    <table className="w-full border-collapse text-[11px] avoid-break">
      <thead>
        <tr className="bg-slate-100 text-left">
          <th className="border border-slate-300 px-2 py-1 w-10">#</th>
          <th className="border border-slate-300 px-2 py-1 w-32">
            Localisation
          </th>
          <th className="border border-slate-300 px-2 py-1 w-16">Lot</th>
          <th className="border border-slate-300 px-2 py-1">Description</th>
          <th className="border border-slate-300 px-2 py-1 w-20">Pour le</th>
          <th className="border border-slate-300 px-2 py-1 w-20">Levée le</th>
        </tr>
      </thead>
      <tbody>
        {reserves.map((r) => (
          <tr key={r.numero} className={r.leveLe ? "bg-green-50" : ""}>
            <td className="border border-slate-300 px-2 py-1 font-bold text-center">
              {r.numero}
            </td>
            <td className="border border-slate-300 px-2 py-1">
              {r.zone ?? "—"}
            </td>
            <td className="border border-slate-300 px-2 py-1 font-mono font-semibold text-center">
              {r.lot ?? "—"}
            </td>
            <td className="border border-slate-300 px-2 py-1 whitespace-pre-wrap">
              {r.texte}
            </td>
            <td className="border border-slate-300 px-2 py-1 text-center">
              {r.dateLimite ?? "—"}
            </td>
            <td className="border border-slate-300 px-2 py-1 text-center text-green-700 font-medium">
              {r.leveLe ?? "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
