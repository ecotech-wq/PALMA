"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Send,
  Paperclip,
  EyeOff,
  Eye,
  X,
  Loader2,
  StickyNote,
  AlertTriangle,
  Package,
  FileText,
  PackageOpen,
  PackageCheck,
} from "lucide-react";
import { useToast } from "@/components/Toast";
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
  { label: string; Icon: typeof StickyNote; color: string; placeholder: string }
> = {
  NOTE: {
    label: "Note",
    Icon: StickyNote,
    color: "text-slate-600",
    placeholder: "Écrire un message...",
  },
  INCIDENT: {
    label: "Incident",
    Icon: AlertTriangle,
    color: "text-red-600",
    placeholder: "Décris l'incident (ex : tuyau cassé au sous-sol...)",
  },
  DEMANDE: {
    label: "Demande matériel",
    Icon: Package,
    color: "text-blue-600",
    placeholder: "Ex : 20 sacs de ciment Bigmat...",
  },
  RAPPORT: {
    label: "Rapport quotidien",
    Icon: FileText,
    color: "text-emerald-600",
    placeholder: "Résumé de la journée, avancement, problèmes...",
  },
  SORTIE: {
    label: "Sortie matériel",
    Icon: PackageOpen,
    color: "text-orange-600",
    placeholder: "Note sur la sortie (optionnel)",
  },
  RETOUR: {
    label: "Retour matériel",
    Icon: PackageCheck,
    color: "text-purple-600",
    placeholder: "Note sur le retour (état, problèmes...)",
  },
};

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
  { value: "SOLEIL", label: "☀️ Soleil" },
  { value: "NUAGEUX", label: "☁️ Nuageux" },
  { value: "PLUIE", label: "🌧 Pluie" },
  { value: "ORAGE", label: "⛈ Orage" },
  { value: "NEIGE", label: "🌨 Neige" },
  { value: "GEL", label: "❄️ Gel" },
  { value: "VENT_FORT", label: "💨 Vent fort" },
];

export function ChantierComposer({
  chantierId,
  canalId,
  materiels,
  equipes,
  sortiesOuvertes,
  canHideFromClient = false,
}: {
  chantierId: string;
  /** Canal actif : les messages postés y sont rattachés (v4.2) */
  canalId?: string | null;
  materiels: Materiel[];
  equipes: Equipe[];
  sortiesOuvertes: SortieOuverte[];
  /** Affiche le toggle « cacher du client » (admin / conducteur uniquement) */
  canHideFromClient?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [category, setCategory] = useState<Categorie>("NOTE");
  const [texte, setTexte] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [hiddenFromClient, setHiddenFromClient] = useState(false);
  const [expanded, setExpanded] = useState(false);
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

  function reset() {
    setTexte("");
    setFiles([]);
    setHiddenFromClient(false);
    setExpanded(false);
    setQuantite("1");
    setUnite("");
    setMeteo("");
    setNbOuvriers("");
    setMaterielId("");
    setEquipeId("");
    setSortieId("");
    setEtatRetour("BON");
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []);
    setFiles(list);
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("chantierId", chantierId);
    if (canalId) fd.set("canalId", canalId);
    fd.set("category", category);
    fd.set("texte", texte);
    if (canHideFromClient && hiddenFromClient) fd.set("hiddenFromClient", "1");
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
        await postChantierMessage(fd);
        toast.success(`${meta.label} envoyé`);
        reset();
        setCategory("NOTE");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur");
      }
    });
  }

  const showAdvancedFields = expanded && category !== "NOTE";
  const materielsDispo = materiels.filter((m) => m.statut === "DISPO");

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden"
    >
      {/* Sélecteur catégorie horizontal */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 overflow-x-auto">
        {(Object.keys(CATEGORY_META) as Categorie[]).map((cat) => {
          const m = CATEGORY_META[cat];
          const active = cat === category;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => {
                setCategory(cat);
                if (cat !== "NOTE") setExpanded(true);
              }}
              className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition ${
                active
                  ? "bg-brand-100 dark:bg-brand-950/60 text-brand-800 dark:text-brand-200"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
              title={m.label}
            >
              <m.Icon size={14} className={active ? meta.color : ""} />
              <span>{m.label}</span>
            </button>
          );
        })}
      </div>

      {/* Champs conditionnels (visible quand expanded) */}
      {showAdvancedFields && (
        <div className="px-3 pt-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/20 space-y-2">
          {category === "INCIDENT" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                <option value="">—</option>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <SelectField
                label="Matériel"
                value={materielId}
                onChange={setMaterielId}
              >
                <option value="">— Choisir —</option>
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
                <option value="">—</option>
                {equipes.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nom}
                  </option>
                ))}
              </SelectField>
            </div>
          )}
          {category === "RETOUR" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <SelectField
                label="Sortie à clôturer"
                value={sortieId}
                onChange={setSortieId}
              >
                <option value="">— Choisir —</option>
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

      {/* Zone texte + médias */}
      <div className="p-2 flex items-start gap-2">
        <textarea
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              submit(e as unknown as React.FormEvent);
            }
          }}
          placeholder={meta.placeholder}
          rows={category === "RAPPORT" ? 4 : 2}
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 resize-y min-h-[40px]"
        />
        <div className="shrink-0 flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Ajouter photos / vidéos"
          >
            <Paperclip size={16} />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={handleFiles}
            className="hidden"
          />
          {category !== "NOTE" && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              title={expanded ? "Replier les options" : "Plus d'options"}
            >
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          )}
        </div>
      </div>

      {/* Aperçu médias sélectionnés */}
      {files.length > 0 && (
        <div className="px-2 pb-2 flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <div
              key={i}
              className="relative inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-xs"
            >
              {f.type.startsWith("video/") ? "🎥" : "🖼"}
              <span className="truncate max-w-[150px]">{f.name}</span>
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="text-slate-400 hover:text-red-600"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Footer : toggle hide client + bouton envoyer */}
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/20">
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          {canHideFromClient && category !== "RAPPORT" && (
            <button
              type="button"
              onClick={() => setHiddenFromClient((v) => !v)}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${
                hiddenFromClient
                  ? "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300"
                  : "hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
              title={
                hiddenFromClient
                  ? "Visible : ce message ne sera PAS envoyé au client"
                  : "Cacher ce message du rapport client"
              }
            >
              {hiddenFromClient ? <EyeOff size={12} /> : <Eye size={12} />}
              {hiddenFromClient ? "Caché du client" : "Visible client"}
            </button>
          )}
          <span className="hidden sm:inline italic">
            <kbd className="px-1 rounded border border-slate-300 dark:border-slate-600">
              Ctrl
            </kbd>{" "}
            + <kbd className="px-1 rounded border border-slate-300 dark:border-slate-600">↵</kbd>{" "}
            pour envoyer
          </span>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium disabled:opacity-50"
        >
          {pending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Send size={14} />
          )}
          Envoyer
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
