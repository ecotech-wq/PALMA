"use client";

import { Printer } from "lucide-react";
import {
  EnteteEspace,
  type EspaceEntete,
} from "@/features/espaces/EnteteEspace";

type EssaiRow = {
  id: string;
  type: string;
  methode: string;
  protocole: string | null;
  eprouvette: string | null;
  equipement: string | null;
  statut: string;
  dateRealisation: string | null;
  echeance: string | null;
  operateur: string | null;
  resultat: string | null;
  seuil: string | null;
  conforme: boolean | null;
  note: string | null;
};

type EprouvetteRow = {
  code: string;
  geometrie: string | null;
  dateFabrication: string | null;
  conditionsCure: string | null;
};

/**
 * Mise en page imprimable du rapport d'essai, structurée selon la logique
 * ISO/IEC 17025 § 7.8 (sans accréditation) :
 *  1. Identification de l'objet soumis à l'essai
 *  2. Éprouvettes et conditions de cure
 *  3. Méthodes et résultats (unités, incertitudes, verdicts)
 *  4. Remarques et déclarations
 *  5. Validation (opérateur, responsable, signatures)
 * Même squelette d'impression que PvPrintView (entête d'entreprise comprise).
 */
export function RapportPrintView({
  espace,
  rapport,
  prelevement,
  eprouvettes,
  essais,
  nbAnnules,
  operateurs,
}: {
  espace: EspaceEntete;
  rapport: { numero: string; dateEdition: string };
  prelevement: {
    reference: string;
    materiau: string;
    origine: string | null;
    datePrelevement: string;
    preleveur: string | null;
    classePrescrite: string | null;
    note: string | null;
    contexte: string;
    composition: string | null;
  };
  eprouvettes: EprouvetteRow[];
  essais: EssaiRow[];
  nbAnnules: number;
  operateurs: string[];
}) {
  const enAttente = essais.filter((e) => e.statut !== "VALIDE").length;
  return (
    <div className="labo-print-view bg-white text-slate-900 max-w-4xl mx-auto p-6 print:p-0 text-[12px]">
      <style>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          body { background: white !important; }
          body * { visibility: hidden !important; }
          .labo-print-view, .labo-print-view * { visibility: visible !important; }
          .labo-print-view { position: absolute; left: 0; top: 0; width: 100%; max-width: none !important; padding: 0 !important; margin: 0 !important; }
          .no-print { display: none !important; }
          .page-break { break-before: page; }
          .avoid-break { break-inside: avoid; }
          /* Couleurs d'entete conservees a l'impression + cadrage stable */
          .entete-espace, .entete-espace * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          html, body { height: auto !important; overflow: visible !important; }
          table { width: 100% !important; }
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

      {/* === Entête et identification du rapport === */}
      <header className="mb-6 avoid-break">
        <EnteteEspace espace={espace} />
        <div className="border-b border-slate-300 pb-3 mb-5">
          <p className="text-xs uppercase tracking-widest text-slate-500">
            Rapport d&apos;essai
          </p>
          <h1 className="text-3xl font-bold tracking-tight mt-1">
            {rapport.numero}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Édité le <strong>{rapport.dateEdition}</strong> · structuré selon
            la logique ISO/IEC 17025 § 7.8 (hors accréditation)
          </p>
        </div>

        {/* 1. Identification de l'objet soumis à l'essai */}
        <section className="mb-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-2">
            1. Identification de l&apos;objet soumis à l&apos;essai
          </h2>
          <table className="w-full border border-slate-300 text-sm">
            <tbody>
              <tr className="border-b border-slate-200">
                <td className="bg-slate-50 px-3 py-1.5 font-medium w-1/3">
                  Prélèvement
                </td>
                <td className="px-3 py-1.5 font-mono">
                  {prelevement.reference}
                </td>
              </tr>
              <tr className="border-b border-slate-200">
                <td className="bg-slate-50 px-3 py-1.5 font-medium">
                  Matériau
                </td>
                <td className="px-3 py-1.5">{prelevement.materiau}</td>
              </tr>
              <tr className="border-b border-slate-200">
                <td className="bg-slate-50 px-3 py-1.5 font-medium">
                  Provenance
                </td>
                <td className="px-3 py-1.5">
                  {prelevement.contexte}
                  {prelevement.origine ? ` · ${prelevement.origine}` : ""}
                </td>
              </tr>
              <tr className="border-b border-slate-200">
                <td className="bg-slate-50 px-3 py-1.5 font-medium">
                  Date de prélèvement
                </td>
                <td className="px-3 py-1.5">
                  {prelevement.datePrelevement}
                  {prelevement.preleveur
                    ? ` par ${prelevement.preleveur}`
                    : ""}
                </td>
              </tr>
              {prelevement.classePrescrite && (
                <tr className="border-b border-slate-200">
                  <td className="bg-slate-50 px-3 py-1.5 font-medium">
                    Classe prescrite
                  </td>
                  <td className="px-3 py-1.5">
                    {prelevement.classePrescrite} (le seuil de conformité en
                    compression est la résistance caractéristique de la
                    classe, sur cylindre ou sur cube selon la géométrie des
                    éprouvettes)
                  </td>
                </tr>
              )}
              {prelevement.composition && (
                <tr>
                  <td className="bg-slate-50 px-3 py-1.5 font-medium align-top">
                    Composition
                  </td>
                  <td className="px-3 py-1.5 whitespace-pre-wrap">
                    {prelevement.composition}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {/* 2. Éprouvettes et conditions de cure */}
        {eprouvettes.length > 0 && (
          <section className="mb-5 avoid-break">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-2">
              2. Éprouvettes et conditions de cure
            </h2>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-slate-100 text-left">
                  <th className="border border-slate-300 px-2 py-1 w-28">
                    Code
                  </th>
                  <th className="border border-slate-300 px-2 py-1">
                    Géométrie
                  </th>
                  <th className="border border-slate-300 px-2 py-1 w-28">
                    Fabrication
                  </th>
                  <th className="border border-slate-300 px-2 py-1">
                    Conditions de cure
                  </th>
                </tr>
              </thead>
              <tbody>
                {eprouvettes.map((ep) => (
                  <tr key={ep.code}>
                    <td className="border border-slate-300 px-2 py-1 font-mono font-semibold">
                      {ep.code}
                    </td>
                    <td className="border border-slate-300 px-2 py-1">
                      {ep.geometrie ?? "-"}
                    </td>
                    <td className="border border-slate-300 px-2 py-1 text-center">
                      {ep.dateFabrication ?? "-"}
                    </td>
                    <td className="border border-slate-300 px-2 py-1">
                      {ep.conditionsCure ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </header>

      {/* === 3. Méthodes et résultats === */}
      <section className="mb-5 avoid-break">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-2">
          3. Méthodes et résultats
        </h2>
        {essais.length === 0 ? (
          <p className="text-sm italic text-slate-500">
            Aucun essai enregistré sur ce prélèvement.
          </p>
        ) : (
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-slate-100 text-left">
                <th className="border border-slate-300 px-2 py-1">Essai</th>
                <th className="border border-slate-300 px-2 py-1 w-28">
                  Méthode
                </th>
                <th className="border border-slate-300 px-2 py-1 w-20">
                  Éprouvette
                </th>
                <th className="border border-slate-300 px-2 py-1 w-24">
                  Réalisé le
                </th>
                <th className="border border-slate-300 px-2 py-1 w-28 text-right">
                  Résultat
                </th>
                <th className="border border-slate-300 px-2 py-1 w-24 text-right">
                  Seuil
                </th>
                <th className="border border-slate-300 px-2 py-1 w-24">
                  Verdict
                </th>
              </tr>
            </thead>
            <tbody>
              {essais.map((e) => (
                <tr key={e.id}>
                  <td className="border border-slate-300 px-2 py-1">
                    {e.type}
                    {e.equipement && (
                      <span className="block text-[10px] text-slate-500">
                        {e.equipement}
                      </span>
                    )}
                  </td>
                  <td className="border border-slate-300 px-2 py-1">
                    {e.methode}
                  </td>
                  <td className="border border-slate-300 px-2 py-1 font-mono text-center">
                    {e.eprouvette ?? "-"}
                  </td>
                  <td className="border border-slate-300 px-2 py-1 text-center">
                    {e.dateRealisation ??
                      (e.echeance ? `prévu ${e.echeance}` : "-")}
                  </td>
                  <td className="border border-slate-300 px-2 py-1 text-right font-mono font-semibold">
                    {e.resultat ?? "-"}
                  </td>
                  <td className="border border-slate-300 px-2 py-1 text-right font-mono">
                    {e.seuil ?? "-"}
                  </td>
                  <td
                    className={`border border-slate-300 px-2 py-1 font-medium ${
                      e.conforme === true
                        ? "text-green-700"
                        : e.conforme === false
                          ? "text-red-700"
                          : "text-slate-500"
                    }`}
                  >
                    {e.conforme === true
                      ? "Conforme"
                      : e.conforme === false
                        ? "Non conforme"
                        : e.statut === "VALIDE"
                          ? "Sans seuil"
                          : "En attente"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {essais.some((e) => e.protocole) && (
          <div className="mt-3 space-y-1">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Protocoles internes appliqués
            </h3>
            {essais
              .filter((e) => e.protocole)
              .map((e) => (
                <p key={e.id} className="text-[11px] text-slate-700">
                  <strong>{e.type}</strong>
                  {e.eprouvette ? ` (${e.eprouvette})` : ""} :{" "}
                  <span className="whitespace-pre-wrap">{e.protocole}</span>
                </p>
              ))}
          </div>
        )}
      </section>

      {/* === 4. Remarques et déclarations === */}
      <section className="mb-5 avoid-break">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-2">
          4. Remarques et déclarations
        </h2>
        <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-700">
          {prelevement.note && (
            <li className="whitespace-pre-wrap">{prelevement.note}</li>
          )}
          {enAttente > 0 && (
            <li>
              {enAttente} essai{enAttente > 1 ? "s" : ""} de ce prélèvement
              {enAttente > 1 ? " sont" : " est"} encore en attente de
              résultat : ce rapport est partiel et sera réédité une fois la
              série complète.
            </li>
          )}
          {nbAnnules > 0 && (
            <li>
              {nbAnnules} essai{nbAnnules > 1 ? "s" : ""} annulé
              {nbAnnules > 1 ? "s" : ""} (non repris dans ce rapport).
            </li>
          )}
          <li>
            Les résultats ne concernent que les objets soumis à l&apos;essai,
            dans les conditions décrites ci-dessus.
          </li>
          <li>
            Ce rapport ne doit pas être reproduit partiellement sans
            l&apos;accord écrit du laboratoire.
          </li>
        </ul>
      </section>

      {/* === 5. Validation et signatures === */}
      <section className="mt-8 avoid-break">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-2">
          5. Validation
        </h2>
        <p className="mb-3 text-[11px] text-slate-700">
          Opérateur{operateurs.length > 1 ? "s" : ""} :{" "}
          {operateurs.length > 0 ? operateurs.join(", ") : "non renseigné"} ·
          rapport édité le {rapport.dateEdition}.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="border border-slate-300 p-3 min-h-[120px]">
            <div className="text-xs uppercase text-slate-500 mb-1 font-semibold">
              Opérateur d&apos;essai
            </div>
            <p className="text-[10px] text-slate-500">
              Nom, date et signature
            </p>
          </div>
          <div className="border border-slate-300 p-3 min-h-[120px]">
            <div className="text-xs uppercase text-slate-500 mb-1 font-semibold">
              Responsable du laboratoire
            </div>
            <p className="text-[10px] text-slate-500">
              Nom, date et signature
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
