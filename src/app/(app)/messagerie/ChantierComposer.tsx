"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Send,
  Paperclip,
  EyeOff,
  Eye,
  X,
  Plus,
  Loader2,
  StickyNote,
  AlertTriangle,
  Package,
  FileText,
  PackageOpen,
  PackageCheck,
  Video,
  Mic,
  Image as ImageIcon,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { usePanneauOpaque } from "@/lib/usePanneauOpaque";
import { EnregistreurAudio } from "@/components/EnregistreurAudio";
import {
  ACCEPT_DOCUMENTS,
  formatEchecsUpload,
  formatTailleFichier,
} from "@/lib/pieces-jointes";
import { postChantierMessage } from "./actions";

type Materiel = { id: string; nomCommun: string; statut: string };
type Equipe = { id: string; nom: string };
type SortieOuverte = {
  id: string;
  materielNom: string;
  dateSortie: Date | string;
};

type Categorie =
  | "NOTE"
  | "INCIDENT"
  | "DEMANDE"
  | "RAPPORT"
  | "SORTIE"
  | "RETOUR";

const CATEGORY_META: Record<
  Categorie,
  {
    label: string;
    Icon: typeof StickyNote;
    color: string;
    placeholder: string;
    description: string;
  }
> = {
  NOTE: {
    label: "Note",
    Icon: StickyNote,
    color: "text-slate-600",
    placeholder: "Écrire un message...",
    description: "Message simple dans le fil",
  },
  INCIDENT: {
    label: "Incident",
    Icon: AlertTriangle,
    color: "text-red-600",
    placeholder: "Décris l'incident (ex : tuyau cassé au sous-sol...)",
    description: "Ouvre une fiche incident à instruire",
  },
  DEMANDE: {
    label: "Demande matériel",
    Icon: Package,
    color: "text-blue-600",
    placeholder: "Ex : 20 sacs de ciment Bigmat...",
    description: "Demande à approuver puis commander",
  },
  RAPPORT: {
    label: "Rapport quotidien",
    Icon: FileText,
    color: "text-emerald-600",
    placeholder: "Résumé de la journée, avancement, problèmes...",
    description: "Bilan du jour (météo, effectif)",
  },
  SORTIE: {
    label: "Sortie matériel",
    Icon: PackageOpen,
    color: "text-orange-600",
    placeholder: "Note sur la sortie (optionnel)",
    description: "Sort un matériel du dépôt vers ce chantier",
  },
  RETOUR: {
    label: "Retour matériel",
    Icon: PackageCheck,
    color: "text-purple-600",
    placeholder: "Note sur le retour (état, problèmes...)",
    description: "Clôture une sortie en cours",
  },
};

const TYPED_CATEGORIES: Categorie[] = [
  "INCIDENT",
  "DEMANDE",
  "RAPPORT",
  "SORTIE",
  "RETOUR",
];

const INCIDENT_CATEGORIES = [
  { value: "MATERIEL_MANQUANT", label: "Matériel manquant" },
  { value: "PANNE", label: "Panne" },
  { value: "METEO", label: "Météo" },
  { value: "RETARD_FOURNISSEUR", label: "Retard fournisseur" },
  { value: "SECURITE", label: "Sécurité" },
  { value: "ACCIDENT", label: "Accident" },
  { value: "CONFLIT", label: "Conflit" },
  { value: "AUTRE", label: "Autre" },
];
const METEO_OPTIONS = [
  { value: "SOLEIL", label: "Soleil" },
  { value: "NUAGEUX", label: "Nuageux" },
  { value: "PLUIE", label: "Pluie" },
  { value: "ORAGE", label: "Orage" },
  { value: "NEIGE", label: "Neige" },
  { value: "GEL", label: "Gel" },
  { value: "VENT_FORT", label: "Vent fort" },
];

/**
 * Composer du fil de chantier, façon WhatsApp : une seule ligne au repos
 * ([+] champ [envoyer]) pour laisser le maximum d'écran aux messages.
 * Le bouton « + » déplie une feuille (bas d'écran au téléphone, menu
 * ancré sur grand écran) avec les catégories typées, l'ajout de photos
 * et la visibilité client. Une catégorie typée choisie affiche un
 * bandeau et ses champs propres, refermables d'un X.
 */
export function ChantierComposer({
  chantierId = "",
  affaireId = null,
  canalId,
  materiels = [],
  equipes = [],
  sortiesOuvertes = [],
  canHideFromClient = false,
}: {
  chantierId?: string;
  /** Contexte AFFAIRE (CRM) : le composer poste dans le canal de
   *  l'affaire (chantierId vide). Les mêmes médias restent disponibles
   *  (photos, vidéos, mémos vocaux, documents) mais les catégories typées
   *  et la visibilité client, propres aux chantiers, sont masquées. */
  affaireId?: string | null;
  /** Canal actif : les messages postés y sont rattachés (v4.2) */
  canalId?: string | null;
  materiels?: Materiel[];
  equipes?: Equipe[];
  sortiesOuvertes?: SortieOuverte[];
  /** Affiche le toggle « cacher du client » (admin / conducteur uniquement) */
  canHideFromClient?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pending, startTransition] = useTransition();
  const panneau = usePanneauOpaque();
  const [category, setCategory] = useState<Categorie>("NOTE");
  const [texte, setTexte] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [hiddenFromClient, setHiddenFromClient] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Champs conditionnels
  const [gravite, setGravite] = useState<"INFO" | "ATTENTION" | "URGENT">(
    "ATTENTION"
  );
  const [categorieIncident, setCategorieIncident] = useState("AUTRE");
  const [quantite, setQuantite] = useState<string>("1");
  const [unite, setUnite] = useState("");
  const [meteo, setMeteo] = useState("");
  const [nbOuvriers, setNbOuvriers] = useState<string>("");
  const [materielId, setMaterielId] = useState("");
  const [equipeId, setEquipeId] = useState("");
  const [sortieId, setSortieId] = useState("");
  const [etatRetour, setEtatRetour] = useState<
    "BON" | "USE" | "CASSE" | "MANQUANT"
  >("BON");

  const meta = CATEGORY_META[category];

  // Fermeture du menu « + » au clic extérieur et à Échap
  useEffect(() => {
    if (!menuOpen) return;
    const surClic = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", surClic);
    document.addEventListener("keydown", surTouche);
    return () => {
      document.removeEventListener("mousedown", surClic);
      document.removeEventListener("keydown", surTouche);
    };
  }, [menuOpen]);

  // Auto-grandissement du champ texte (1 ligne au repos, borné)
  function autosize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 132) + "px";
  }

  function reset() {
    setTexte("");
    setFiles([]);
    setHiddenFromClient(false);
    setGravite("ATTENTION");
    setCategorieIncident("AUTRE");
    setQuantite("1");
    setUnite("");
    setMeteo("");
    setNbOuvriers("");
    setMaterielId("");
    setEquipeId("");
    setSortieId("");
    setEtatRetour("BON");
    if (fileRef.current) fileRef.current.value = "";
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  function quitterCategorie() {
    setCategory("NOTE");
  }

  function choisirCategorie(cat: Categorie) {
    setCategory(cat);
    setMenuOpen(false);
    textareaRef.current?.focus();
  }

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []);
    // Ajout (pas remplacement) : on peut cumuler photos ET documents
    // avant l'envoi. L'input est vidé pour pouvoir re-choisir le même
    // fichier après un retrait.
    setFiles((prev) => [...prev, ...list]);
    if (e.target) e.target.value = "";
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  /** Cible du message : chantier OU affaire (exactement l'une des deux). */
  function poserCible(fd: FormData) {
    if (affaireId) fd.set("affaireId", affaireId);
    else fd.set("chantierId", chantierId);
  }

  /** Envoi immédiat d'un mémo vocal, comme un message à part entière. */
  function envoyerAudio(fichier: File) {
    const fd = new FormData();
    poserCible(fd);
    if (canalId) fd.set("canalId", canalId);
    fd.set("category", "NOTE");
    fd.set("texte", "");
    if (canHideFromClient && hiddenFromClient) fd.set("hiddenFromClient", "1");
    fd.append("medias", fichier);
    startTransition(async () => {
      try {
        const res = await postChantierMessage(fd);
        if (res.echecs.length > 0) {
          toast.error(formatEchecsUpload(res.echecs));
        } else {
          toast.success("Mémo vocal envoyé");
        }
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur");
      }
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    poserCible(fd);
    if (canalId) fd.set("canalId", canalId);
    fd.set("category", category);
    fd.set("texte", texte);
    // Jamais pour un RAPPORT : le toggle est masqué en RAPPORT, mais un
    // reste d'état posé en NOTE ne doit pas suivre le changement de type
    if (canHideFromClient && hiddenFromClient && category !== "RAPPORT") {
      fd.set("hiddenFromClient", "1");
    }
    // Champs conditionnels
    if (category === "INCIDENT") {
      fd.set("gravite", gravite);
      fd.set("categorieIncident", categorieIncident);
    }
    if (category === "DEMANDE") {
      fd.set("quantite", quantite || "1");
      if (unite) fd.set("unite", unite);
      fd.set("gravite", gravite);
    }
    if (category === "RAPPORT") {
      if (meteo) fd.set("meteo", meteo);
      if (nbOuvriers) fd.set("nbOuvriers", nbOuvriers);
    }
    if (category === "SORTIE") {
      if (!materielId) {
        toast.error("Sélectionnez un matériel");
        return;
      }
      fd.set("materielId", materielId);
      if (equipeId) fd.set("equipeId", equipeId);
    }
    if (category === "RETOUR") {
      if (!sortieId) {
        toast.error("Sélectionnez la sortie à clôturer");
        return;
      }
      fd.set("sortieId", sortieId);
      fd.set("etatRetour", etatRetour);
    }
    // Médias
    for (const f of files) fd.append("medias", f);

    startTransition(async () => {
      try {
        const res = await postChantierMessage(fd);
        if (res.echecs.length > 0) {
          // Le message est parti, mais des pièces jointes ont été
          // refusées (taille, extension...) : on le dit clairement.
          toast.error(`${meta.label} envoyé, mais ${formatEchecsUpload(res.echecs)}`);
        } else {
          toast.success(`${meta.label} envoyé`);
        }
        reset();
        setCategory("NOTE");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur");
      }
    });
  }

  const materielsDispo = materiels.filter((m) => m.statut === "DISPO");
  const isTyped = category !== "NOTE";

  return (
    <form
      onSubmit={submit}
      className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm"
    >
      {/* Bandeau catégorie typée : rappel + fermeture d'un X */}
      {isTyped && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 text-xs">
          <meta.Icon size={13} className={meta.color} />
          <span className="font-medium text-slate-700 dark:text-slate-300">
            {meta.label}
          </span>
          {canHideFromClient && hiddenFromClient && category !== "RAPPORT" && (
            <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 dark:bg-amber-950/40 px-1.5 py-0.5 text-[10px] text-amber-800 dark:text-amber-300">
              <EyeOff size={10} /> caché du client
            </span>
          )}
          <button
            type="button"
            onClick={quitterCategorie}
            aria-label="Revenir au message simple"
            className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Note simple marquée cachée du client : rappel discret */}
      {!isTyped && canHideFromClient && hiddenFromClient && (
        <div className="flex items-center gap-1.5 px-3 py-1 border-b border-slate-100 dark:border-slate-800">
          <span className="inline-flex items-center gap-1 text-[10px] text-amber-800 dark:text-amber-300">
            <EyeOff size={10} /> Ce message sera caché du client
          </span>
          <button
            type="button"
            onClick={() => setHiddenFromClient(false)}
            aria-label="Rendre visible au client"
            className="ml-auto rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Champs propres à la catégorie choisie */}
      {isTyped && (
        <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/20 space-y-2">
          {category === "INCIDENT" && (
            <div className="grid grid-cols-2 gap-2">
              <SelectField label="Gravité" value={gravite} onChange={(v) => setGravite(v as typeof gravite)}>
                <option value="INFO">Info</option>
                <option value="ATTENTION">Attention</option>
                <option value="URGENT">Urgent</option>
              </SelectField>
              <SelectField
                label="Catégorie"
                value={categorieIncident}
                onChange={(v) => setCategorieIncident(v)}
              >
                {INCIDENT_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </SelectField>
            </div>
          )}
          {category === "DEMANDE" && (
            <div className="grid grid-cols-3 gap-2">
              <InputField
                label="Quantité"
                type="number"
                min="0"
                step="0.01"
                value={quantite}
                onChange={setQuantite}
              />
              <InputField
                label="Unité"
                value={unite}
                onChange={setUnite}
                placeholder="sac, kg, ml..."
              />
              <SelectField label="Urgence" value={gravite} onChange={(v) => setGravite(v as typeof gravite)}>
                <option value="INFO">Info</option>
                <option value="ATTENTION">Normal</option>
                <option value="URGENT">Urgent</option>
              </SelectField>
            </div>
          )}
          {category === "RAPPORT" && (
            <div className="grid grid-cols-2 gap-2">
              <SelectField label="Météo" value={meteo} onChange={setMeteo}>
                <option value="">Non précisée</option>
                {METEO_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </SelectField>
              <InputField
                label="Nb d'ouvriers"
                type="number"
                min="0"
                value={nbOuvriers}
                onChange={setNbOuvriers}
              />
            </div>
          )}
          {category === "SORTIE" && (
            <div className="grid grid-cols-2 gap-2">
              <SelectField
                label="Matériel"
                value={materielId}
                onChange={setMaterielId}
              >
                <option value="">Choisir</option>
                {materielsDispo.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nomCommun}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Équipe (optionnel)"
                value={equipeId}
                onChange={setEquipeId}
              >
                <option value="">Aucune</option>
                {equipes.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nom}
                  </option>
                ))}
              </SelectField>
            </div>
          )}
          {category === "RETOUR" && (
            <div className="grid grid-cols-2 gap-2">
              <SelectField
                label="Sortie à clôturer"
                value={sortieId}
                onChange={setSortieId}
              >
                <option value="">Choisir</option>
                {sortiesOuvertes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.materielNom}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="État au retour"
                value={etatRetour}
                onChange={(v) => setEtatRetour(v as typeof etatRetour)}
              >
                <option value="BON">Bon</option>
                <option value="USE">Usé</option>
                <option value="CASSE">Cassé</option>
                <option value="MANQUANT">Manquant</option>
              </SelectField>
            </div>
          )}
        </div>
      )}

      {/* Aperçu médias sélectionnés */}
      {files.length > 0 && (
        <div className="px-3 pt-2 flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <div
              key={i}
              className="relative inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300"
            >
              {f.type.startsWith("video/") ? (
                <Video size={12} className="text-slate-500" />
              ) : f.type.startsWith("audio/") ? (
                <Mic size={12} className="text-slate-500" />
              ) : f.type.startsWith("image/") ? (
                <ImageIcon size={12} className="text-slate-500" />
              ) : (
                <FileText size={12} className="text-slate-500" />
              )}
              <span className="truncate max-w-[150px]">{f.name}</span>
              {f.size > 0 && (
                <span className="text-[10px] text-slate-400">
                  {formatTailleFichier(f.size)}
                </span>
              )}
              <button
                type="button"
                onClick={() => removeFile(i)}
                aria-label={`Retirer ${f.name}`}
                className="text-slate-400 hover:text-red-600"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Ligne principale : [+] [champ] [envoyer] */}
      <div className="flex items-end gap-1.5 p-1.5">
        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Plus d'options (catégories, photos, visibilité)"
            className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
              menuOpen
                ? "bg-brand-100 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300"
                : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Plus
              size={20}
              className={`transition-transform ${menuOpen ? "rotate-45" : ""}`}
            />
          </button>

          {menuOpen && (
            <>
              {/* Voile mobile : rend la feuille modale et ferme au toucher */}
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => setMenuOpen(false)}
                className="fixed inset-0 z-40 cursor-default bg-black/25 sm:hidden"
              />
              <div
                role="menu"
                className="fixed inset-x-3 bottom-3 z-50 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1.5 shadow-xl sm:absolute sm:inset-x-auto sm:bottom-full sm:left-0 sm:z-30 sm:mb-2 sm:w-72 sm:rounded-md sm:p-1 sm:shadow-lg"
                style={{
                  ...panneau,
                  paddingBottom: "max(0.375rem, env(safe-area-inset-bottom))",
                }}
              >
                {/* Catégories typées : objets de CHANTIER (incident,
                    demande, rapport, sortie). Sans objet dans un fil
                    d'affaire, où seul le message simple existe. */}
                {!affaireId && (
                  <>
                    <div className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      Type de message
                    </div>
                    {TYPED_CATEGORIES.map((cat) => {
                      const m = CATEGORY_META[cat];
                      return (
                        <button
                          key={cat}
                          type="button"
                          role="menuitem"
                          onClick={() => choisirCategorie(cat)}
                          className="flex w-full items-start gap-2.5 rounded px-2 py-2 text-left transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 sm:py-1.5"
                        >
                          <m.Icon size={15} className={`mt-0.5 shrink-0 ${m.color}`} />
                          <span className="min-w-0">
                            <span className="block text-xs font-medium text-slate-800 dark:text-slate-200">
                              {m.label}
                            </span>
                            <span className="block text-xs text-slate-500 dark:text-slate-400">
                              {m.description}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                    <div className="my-1 h-px bg-slate-100 dark:bg-slate-800" />
                  </>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    fileRef.current?.click();
                  }}
                  className="flex w-full items-center gap-2.5 rounded px-2 py-2 text-left text-xs font-medium text-slate-800 dark:text-slate-200 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 sm:py-1.5"
                >
                  <Paperclip size={15} className="shrink-0 text-slate-500" />
                  Photos / vidéos
                </button>
                {canHideFromClient && category !== "RAPPORT" && (
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={hiddenFromClient}
                    onClick={() => {
                      setHiddenFromClient((v) => !v);
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 rounded px-2 py-2 text-left text-xs font-medium transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 sm:py-1.5"
                  >
                    {hiddenFromClient ? (
                      <>
                        <Eye size={15} className="shrink-0 text-slate-500" />
                        <span className="text-slate-800 dark:text-slate-200">
                          Rendre visible au client
                        </span>
                      </>
                    ) : (
                      <>
                        <EyeOff size={15} className="shrink-0 text-amber-600" />
                        <span className="text-slate-800 dark:text-slate-200">
                          Cacher du client
                        </span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={handleFiles}
          className="hidden"
        />
        {/* Documents (trombone) : mêmes extensions que la GED chantier */}
        <input
          ref={docRef}
          type="file"
          accept={ACCEPT_DOCUMENTS}
          multiple
          onChange={handleFiles}
          className="hidden"
        />

        {/* Mémo vocal : bouton micro 44 px, panneau au-dessus de la barre */}
        <EnregistreurAudio
          onEnvoyer={envoyerAudio}
          disabled={pending}
          envoiEnCours={pending}
        />

        {/* Pièce jointe document */}
        <button
          type="button"
          onClick={() => docRef.current?.click()}
          aria-label="Joindre un document"
          title="Joindre un document (PDF, Office, DWG...)"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <Paperclip size={18} />
        </button>

        <textarea
          ref={textareaRef}
          value={texte}
          onChange={(e) => {
            setTexte(e.target.value);
            autosize();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              submit(e as unknown as React.FormEvent);
            }
          }}
          placeholder={
            affaireId ? "Écrire dans le fil de l'affaire..." : meta.placeholder
          }
          rows={1}
          title="Ctrl+Entrée pour envoyer"
          className="min-w-0 flex-1 resize-none self-center rounded-2xl bg-slate-100 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-brand-400"
        />

        <button
          type="submit"
          disabled={pending}
          aria-label="Envoyer"
          title="Envoyer (Ctrl+Entrée)"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Send size={16} />
          )}
        </button>
      </div>
    </form>
  );
}

/* ----- Petits champs utilitaires pour la compose form ----- */

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs">
      <span className="text-slate-600 dark:text-slate-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 block w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs"
      >
        {children}
      </select>
    </label>
  );
}

function InputField({
  label,
  value,
  onChange,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <label className="block text-xs">
      <span className="text-slate-600 dark:text-slate-400">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
        className="mt-0.5 block w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs"
      />
    </label>
  );
}
