import { FileText, Mic } from "lucide-react";
import {
  formatTailleFichier,
  type DocumentMessage,
} from "@/lib/pieces-jointes";

/**
 * Rendu des pièces jointes non photo/vidéo d'un message du fil
 * (messagerie de chantier et journal) : mémos vocaux et documents.
 * Composants purs, sans état, partagés par les deux fils pour que les
 * bulles restent identiques partout.
 */

/** Bulles compactes de lecture des mémos vocaux d'un message. */
export function AudiosMessage({ audios }: { audios: string[] }) {
  if (audios.length === 0) return null;
  return (
    <div className="mt-1.5 space-y-1.5">
      {audios.map((url) => (
        <div
          key={url}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-800"
        >
          <Mic size={14} className="shrink-0 text-slate-500" />
          {/* La route /uploads sert les requêtes Range : preload="metadata"
              suffit pour afficher la durée sans télécharger le fichier. */}
          <audio
            src={url}
            controls
            preload="metadata"
            className="h-9 w-52 max-w-full sm:w-64"
          />
        </div>
      ))}
    </div>
  );
}

/** Pièces jointes documentaires : nom d'origine, taille, nouvel onglet. */
export function DocumentsMessage({
  documents,
}: {
  documents: DocumentMessage[];
}) {
  if (documents.length === 0) return null;
  return (
    <div className="mt-1.5 space-y-1">
      {documents.map((doc) => (
        <a
          key={doc.url}
          href={doc.url}
          target="_blank"
          rel="noopener noreferrer"
          title={`Ouvrir ${doc.nom}`}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
        >
          <FileText size={16} className="shrink-0 text-slate-500" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800 dark:text-slate-200">
            {doc.nom}
          </span>
          {doc.taille > 0 && (
            <span className="shrink-0 text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
              {formatTailleFichier(doc.taille)}
            </span>
          )}
        </a>
      ))}
    </div>
  );
}
