"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Send, Square, X } from "lucide-react";
import { formatDureeAudio } from "@/lib/pieces-jointes";

/**
 * Enregistreur de mémo vocal pour les barres d'envoi (messagerie de
 * chantier et journal). Au repos : un simple bouton micro de 44 px.
 * Pendant l'enregistrement puis l'aperçu, un panneau sobre recouvre la
 * barre d'envoi (le parent doit être en `position: relative`).
 *
 * Trois états : prêt -> enregistrement (durée qui défile, arrêt, annuler)
 * -> aperçu (<audio controls> + Envoyer + Annuler). Le refus de la
 * permission micro affiche un message clair dans le même panneau.
 *
 * MediaRecorder : audio/webm;codecs=opus en priorité (Chrome, Firefox,
 * Edge), repli audio/mp4 pour iOS Safari (fichier .m4a). Le fichier est
 * envoyé brut, sans transcodage, via le callback `onEnvoyer` (l'action
 * serveur du fil correspondant).
 */

type Phase = "pret" | "enregistrement" | "apercu" | "erreur";

const MIMES_CANDIDATS = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
] as const;

function choisirMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return MIMES_CANDIDATS.find((m) => {
    try {
      return MediaRecorder.isTypeSupported(m);
    } catch {
      return false;
    }
  });
}

function extensionPourMime(mime: string): string {
  return mime.includes("mp4") ? "m4a" : "webm";
}

export function EnregistreurAudio({
  onEnvoyer,
  disabled = false,
  envoiEnCours = false,
}: {
  /** Reçoit le fichier audio finalisé (nom memo-vocal-*.webm ou .m4a). */
  onEnvoyer: (fichier: File) => void;
  disabled?: boolean;
  /** Vrai pendant l'envoi serveur : fige le bouton Envoyer de l'aperçu. */
  envoiEnCours?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("pret");
  const [secondes, setSecondes] = useState(0);
  const [erreur, setErreur] = useState("");
  const [apercuUrl, setApercuUrl] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const mimeRef = useRef<string>("audio/webm");
  const dureeRef = useRef(0);
  // Vrai si l'utilisateur annule PENDANT l'enregistrement : le onstop
  // ne doit alors pas ouvrir l'aperçu.
  const annuleRef = useRef(false);
  // Verrou anti double-tap : posé AVANT l'await de getUserMedia (l'invite
  // de permission peut durer), sinon deux démarrages concurrents ouvrent
  // deux flux micro (le premier n'est jamais stoppé) et mélangent leurs
  // chunks dans le même mémo.
  const verrouRef = useRef(false);

  function arreterFlux() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function arreterTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

  // Nettoyage au démontage : timer, micro, URL d'aperçu
  useEffect(() => {
    return () => {
      arreterTimer();
      arreterFlux();
      if (apercuUrl) URL.revokeObjectURL(apercuUrl);
    };
    // apercuUrl volontairement hors deps : on ne nettoie qu'au démontage,
    // la révocation en cours de vie est gérée par reinitialiser().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function reinitialiser() {
    arreterTimer();
    arreterFlux();
    if (apercuUrl) URL.revokeObjectURL(apercuUrl);
    setApercuUrl(null);
    blobRef.current = null;
    chunksRef.current = [];
    setSecondes(0);
    dureeRef.current = 0;
    setErreur("");
    setPhase("pret");
  }

  async function demarrer() {
    if (
      disabled ||
      verrouRef.current ||
      phase === "enregistrement" ||
      // Garde par ref (synchrone) : `phase` peut être en retard d'un
      // rendu sur un tap très rapproché.
      recorderRef.current?.state === "recording"
    ) {
      return;
    }
    verrouRef.current = true;
    try {
      setErreur("");
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      ) {
        setErreur(
          "L'enregistrement audio n'est pas pris en charge par ce navigateur."
        );
        setPhase("erreur");
        return;
      }
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        const nom = e instanceof DOMException ? e.name : "";
        setErreur(
          nom === "NotAllowedError" || nom === "SecurityError"
            ? "Accès au micro refusé. Autorisez le micro pour ce site dans les réglages du navigateur, puis réessayez."
            : nom === "NotFoundError"
              ? "Aucun micro détecté sur cet appareil."
              : "Impossible d'accéder au micro. Réessayez."
        );
        setPhase("erreur");
        return;
      }

      const mime = choisirMime();
      let recorder: MediaRecorder;
      try {
        recorder = mime
          ? new MediaRecorder(stream, { mimeType: mime })
          : new MediaRecorder(stream);
      } catch {
        stream.getTracks().forEach((t) => t.stop());
        setErreur("Impossible de démarrer l'enregistrement sur cet appareil.");
        setPhase("erreur");
        return;
      }

      // Ceinture et bretelles : jamais deux flux micro ouverts. Si un
      // ancien flux traînait encore, on le stoppe avant de l'écraser.
      arreterFlux();
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      annuleRef.current = false;
      // Type effectif choisi par le navigateur (peut préciser le codec)
      mimeRef.current = recorder.mimeType || mime || "audio/webm";

      recorder.ondataavailable = (ev: BlobEvent) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        arreterFlux();
        if (annuleRef.current) return;
        const blob = new Blob(chunksRef.current, { type: mimeRef.current });
        if (blob.size === 0) {
          setErreur("Enregistrement vide. Réessayez.");
          setPhase("erreur");
          return;
        }
        blobRef.current = blob;
        setApercuUrl(URL.createObjectURL(blob));
        setPhase("apercu");
      };

      setSecondes(0);
      dureeRef.current = 0;
      setPhase("enregistrement");
      // timeslice 1 s : des chunks réguliers, rien n'est perdu si l'onglet
      // se ferme, et la durée affichée suit le même rythme.
      recorder.start(1000);
      timerRef.current = setInterval(() => {
        dureeRef.current += 1;
        setSecondes(dureeRef.current);
      }, 1000);
    } finally {
      verrouRef.current = false;
    }
  }

  function arreter() {
    arreterTimer();
    const r = recorderRef.current;
    if (r && r.state !== "inactive") r.stop();
  }

  function annuler() {
    annuleRef.current = true;
    arreterTimer();
    const r = recorderRef.current;
    if (r && r.state !== "inactive") r.stop();
    reinitialiser();
  }

  function envoyer() {
    const blob = blobRef.current;
    if (!blob || envoiEnCours) return;
    const ext = extensionPourMime(mimeRef.current);
    const horodatage = new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[:T]/g, "-");
    const fichier = new File([blob], `memo-vocal-${horodatage}.${ext}`, {
      // File.type doit rester un type MIME simple (sans ";codecs=...")
      type: mimeRef.current.split(";")[0] || "audio/webm",
    });
    onEnvoyer(fichier);
    reinitialiser();
  }

  return (
    <>
      {/* Bouton micro : 44 px, toujours présent dans la barre */}
      <button
        type="button"
        onClick={demarrer}
        disabled={disabled || phase === "enregistrement"}
        aria-label="Enregistrer un mémo vocal"
        title="Mémo vocal"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      >
        <Mic size={19} />
      </button>

      {/* Panneau d'état : recouvre la barre d'envoi (parent en relative) */}
      {phase !== "pret" && (
        <div className="absolute inset-x-0 bottom-0 z-30 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {phase === "enregistrement" && (
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="ml-1 h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-600"
              />
              <span className="text-sm font-medium tabular-nums text-slate-800 dark:text-slate-200">
                {formatDureeAudio(secondes)}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-slate-500 dark:text-slate-400">
                Enregistrement en cours…
              </span>
              <button
                type="button"
                onClick={arreter}
                aria-label="Terminer l'enregistrement"
                title="Terminer"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white transition-colors hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
              >
                <Square size={15} />
              </button>
              <button
                type="button"
                onClick={annuler}
                aria-label="Annuler l'enregistrement"
                title="Annuler"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X size={18} />
              </button>
            </div>
          )}

          {phase === "apercu" && apercuUrl && (
            <div className="flex items-center gap-2">
              <Mic size={16} className="ml-1 shrink-0 text-slate-500" />
              <audio
                src={apercuUrl}
                controls
                preload="metadata"
                className="h-10 min-w-0 flex-1"
              />
              <span className="shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                {formatDureeAudio(dureeRef.current)}
              </span>
              <button
                type="button"
                onClick={envoyer}
                disabled={envoiEnCours}
                aria-label="Envoyer le mémo vocal"
                title="Envoyer"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
              >
                {envoiEnCours ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}
              </button>
              <button
                type="button"
                onClick={annuler}
                disabled={envoiEnCours}
                aria-label="Annuler le mémo vocal"
                title="Annuler"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X size={18} />
              </button>
            </div>
          )}

          {phase === "erreur" && (
            <div className="flex items-center gap-2">
              <Mic size={16} className="ml-1 shrink-0 text-amber-600" />
              <p className="min-w-0 flex-1 text-xs text-slate-700 dark:text-slate-300">
                {erreur}
              </p>
              <button
                type="button"
                onClick={reinitialiser}
                aria-label="Fermer le message d'erreur"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X size={18} />
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
