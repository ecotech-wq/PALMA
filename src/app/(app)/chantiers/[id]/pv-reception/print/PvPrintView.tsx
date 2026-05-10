"use client";

import { Printer } from "lucide-react";

type Pin = {
  id: string;
  numero: number;
  posX: number;
  posY: number;
  leveLe: boolean;
};

type Plan = {
  id: string;
  url: string;
  nom: string | null;
  pins: Pin[];
};

type Reserve = {
  numero: number;
  texte: string;
  zone: string | null;
  photos: string[];
  planNom: string | null;
  leveLe: string | null;
  leveNote: string | null;
};

/**
 * Vue imprimable du PV de réception. Mise en page sobre A4.
 * Le bouton "Imprimer" est masqué à l'impression via @media print.
 */
export function PvPrintView({
  chantier,
  pv,
  plans,
  reserves,
}: {
  chantier: { nom: string; adresse: string | null; chefName: string | null };
  pv: {
    dateReception: string;
    texteRecap: string | null;
    statut: string;
    signatureAdminUrl: string | null;
    signatureAdminLe: string | null;
    signatureClientUrl: string | null;
    signatureClientLe: string | null;
    reservesLeveeUrl: string | null;
    reservesLeveeLe: string | null;
  };
  plans: Plan[];
  reserves: Reserve[];
}) {
  return (
    <div className="pv-print-view bg-white text-slate-900 max-w-4xl mx-auto p-6 print:p-0">
      <style>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          body { background: white !important; }
          body * { visibility: hidden !important; }
          .pv-print-view, .pv-print-view * { visibility: visible !important; }
          .pv-print-view { position: absolute; left: 0; top: 0; width: 100%; max-width: none !important; padding: 0 !important; margin: 0 !important; }
          .no-print { display: none !important; }
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

      <header className="border-b-2 border-slate-900 pb-3 mb-5">
        <h1 className="text-2xl font-bold tracking-tight">
          Procès-verbal de réception
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Chantier : <strong>{chantier.nom}</strong>
          {chantier.adresse && <> — {chantier.adresse}</>}
        </p>
        <p className="text-sm text-slate-600">
          Date de réception : <strong>{pv.dateReception}</strong>
        </p>
        {chantier.chefName && (
          <p className="text-sm text-slate-600">
            Conducteur de travaux : {chantier.chefName}
          </p>
        )}
      </header>

      {pv.texteRecap && (
        <section className="mb-5">
          <h2 className="text-base font-semibold mb-2 uppercase tracking-wide text-slate-700">
            Récapitulatif
          </h2>
          <p className="text-sm whitespace-pre-wrap">{pv.texteRecap}</p>
        </section>
      )}

      {/* Plans avec puces */}
      {plans.length > 0 && (
        <section className="mb-6">
          <h2 className="text-base font-semibold mb-2 uppercase tracking-wide text-slate-700">
            Plans
          </h2>
          <div className="space-y-4">
            {plans.map((plan) => (
              <div key={plan.id} className="break-inside-avoid">
                <div className="text-sm font-medium mb-1">
                  {plan.nom || "Plan"}
                </div>
                <div className="relative inline-block max-w-full border border-slate-300">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={plan.url}
                    alt={plan.nom || "Plan"}
                    className="block max-w-full h-auto"
                  />
                  {plan.pins.map((p) => (
                    <div
                      key={p.id}
                      className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                      style={{
                        left: `${p.posX * 100}%`,
                        top: `${p.posY * 100}%`,
                      }}
                    >
                      <div
                        className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold border-2 ${
                          p.leveLe
                            ? "bg-green-500 border-green-700 text-white"
                            : "bg-red-500 border-red-700 text-white"
                        }`}
                      >
                        {p.numero}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Liste des réserves */}
      <section className="mb-6">
        <h2 className="text-base font-semibold mb-2 uppercase tracking-wide text-slate-700">
          Réserves ({reserves.length})
        </h2>
        {reserves.length === 0 ? (
          <p className="text-sm italic text-slate-500">
            Réception sans réserve.
          </p>
        ) : (
          <ol className="space-y-3">
            {reserves.map((r) => (
              <li
                key={r.numero}
                className="break-inside-avoid border border-slate-300 rounded p-3 flex gap-3"
              >
                <div
                  className={`shrink-0 flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold border-2 ${
                    r.leveLe
                      ? "bg-green-500 border-green-700 text-white"
                      : "bg-red-500 border-red-700 text-white"
                  }`}
                >
                  {r.numero}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm whitespace-pre-wrap">{r.texte}</p>
                  <div className="text-xs text-slate-600 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    {r.zone && <span>Zone : {r.zone}</span>}
                    {r.planNom && <span>Plan : {r.planNom}</span>}
                    {r.leveLe && (
                      <span className="text-green-700 font-medium">
                        Levée le {r.leveLe}
                      </span>
                    )}
                  </div>
                  {r.photos.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {r.photos.map((url, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={i}
                          src={url}
                          alt={`Photo réserve ${r.numero}-${i + 1}`}
                          className="w-32 h-32 object-cover border border-slate-300"
                        />
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Signatures */}
      <section className="break-inside-avoid mt-8">
        <h2 className="text-base font-semibold mb-3 uppercase tracking-wide text-slate-700">
          Signatures
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="border border-slate-300 p-3 min-h-[120px]">
            <div className="text-xs uppercase text-slate-500 mb-1">
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
                  <p className="text-[11px] text-slate-600 mt-1">
                    Le {pv.signatureAdminLe}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs italic text-slate-400">Non signé</p>
            )}
          </div>
          <div className="border border-slate-300 p-3 min-h-[120px]">
            <div className="text-xs uppercase text-slate-500 mb-1">
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
                  <p className="text-[11px] text-slate-600 mt-1">
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
            <div className="text-xs uppercase text-slate-500 mb-1">
              Signature de levée des réserves (client)
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pv.reservesLeveeUrl}
              alt="Signature levée"
              className="max-h-24"
            />
            {pv.reservesLeveeLe && (
              <p className="text-[11px] text-slate-600 mt-1">
                Le {pv.reservesLeveeLe}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
