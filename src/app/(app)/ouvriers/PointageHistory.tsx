"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { Pencil, Trash2, Save, X, Calendar, Camera, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Field, Select } from "@/components/ui/Input";
import { useToast } from "@/components/Toast";

type Pointage = {
  id: string;
  date: Date;
  joursTravailles: number;
  chantierId: string | null;
  chantierNom: string | null;
  note: string | null;
  photo?: string | null;
};

type Chantier = { id: string; nom: string };

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function joursLabel(j: number): string {
  if (j === 1) return "Journée entière";
  if (j === 0.5) return "½ journée";
  return `${j} j`;
}

export function PointageHistory({
  pointages,
  chantiers,
  onUpdate,
  onDelete,
  onUploadPhoto,
  onRemovePhoto,
}: {
  pointages: Pointage[];
  chantiers: Chantier[];
  onUpdate: (id: string, formData: FormData) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onUploadPhoto?: (id: string, formData: FormData) => Promise<void>;
  onRemovePhoto?: (id: string) => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (pointages.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Aucun pointage sur les 60 derniers jours.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {pointages.map((p) =>
        editingId === p.id ? (
          <li key={p.id} className="py-3 bg-brand-50/40 dark:bg-brand-200/10 -mx-4 px-4">
            <EditRow
              pointage={p}
              chantiers={chantiers}
              onUpdate={onUpdate}
              onClose={() => setEditingId(null)}
            />
          </li>
        ) : (
          <DisplayRow
            key={p.id}
            pointage={p}
            onEdit={() => setEditingId(p.id)}
            onDelete={onDelete}
            onUploadPhoto={onUploadPhoto}
            onRemovePhoto={onRemovePhoto}
          />
        )
      )}
    </ul>
  );
}

function DisplayRow({
  pointage: p,
  onEdit,
  onDelete,
  onUploadPhoto,
  onRemovePhoto,
}: {
  pointage: Pointage;
  onEdit: () => void;
  onDelete: (id: string) => Promise<void>;
  onUploadPhoto?: (id: string, formData: FormData) => Promise<void>;
  onRemovePhoto?: (id: string) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [showPhoto, setShowPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  function onPhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !onUploadPhoto) return;
    const fd = new FormData();
    fd.append("photo", file);
    startTransition(async () => {
      try {
        await onUploadPhoto(p.id, fd);
        toast.success("Photo ajoutée");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur");
      }
    });
    // Reset input pour pouvoir re-uploader le même fichier si besoin
    e.target.value = "";
  }

  function onRemove() {
    if (!onRemovePhoto || !p.photo) return;
    if (!confirm("Retirer la photo de ce pointage ?")) return;
    startTransition(async () => {
      try {
        await onRemovePhoto(p.id);
        setShowPhoto(false);
        toast.success("Photo retirée");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erreur");
      }
    });
  }

  return (
    <li className="py-2.5">
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 shrink-0 rounded-full bg-brand-50 dark:bg-brand-200/20 text-brand-700 flex items-center justify-center">
          <Calendar size={13} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100 capitalize">
              {dateFmt.format(new Date(p.date))}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {joursLabel(p.joursTravailles)}
            </span>
            {p.chantierNom && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                · {p.chantierNom}
              </span>
            )}
            {p.photo && (
              <button
                type="button"
                onClick={() => setShowPhoto((v) => !v)}
                className="text-xs text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-0.5"
                title="Voir / cacher la photo"
              >
                <ImageIcon size={11} />
                {showPhoto ? "Cacher" : "Voir photo"}
              </button>
            )}
          </div>
          {p.note && (
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 italic truncate">
              {p.note}
            </div>
          )}
        </div>

        {onUploadPhoto && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onPhotoSelected}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={pending}
              className={`p-1.5 ${p.photo ? "text-brand-600 dark:text-brand-400" : "text-slate-400 dark:text-slate-500 hover:text-brand-600"}`}
              title={p.photo ? "Remplacer la photo" : "Ajouter une photo"}
            >
              <Camera size={14} />
            </button>
          </>
        )}
        <button
          onClick={onEdit}
          disabled={pending}
          className="text-slate-500 dark:text-slate-400 hover:text-brand-600 p-1.5"
          title="Modifier"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={() => {
            if (
              !confirm(
                `Supprimer le pointage du ${dateFmt.format(new Date(p.date))} ?`
              )
            )
              return;
            startTransition(async () => {
              await onDelete(p.id);
            });
          }}
          disabled={pending}
          className="text-slate-400 dark:text-slate-500 hover:text-red-600 p-1.5"
          title="Supprimer"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Photo dépliée */}
      {showPhoto && p.photo && (
        <div className="mt-2 relative">
          <Image
            src={p.photo}
            alt="Photo du pointage"
            width={400}
            height={400}
            className="rounded-md border border-slate-200 dark:border-slate-800 max-w-full h-auto object-contain bg-slate-50 dark:bg-slate-900"
          />
          {onRemovePhoto && (
            <button
              type="button"
              onClick={onRemove}
              disabled={pending}
              className="mt-1 text-[11px] text-red-600 dark:text-red-400 hover:underline inline-flex items-center gap-1"
            >
              <Trash2 size={11} /> Retirer la photo
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function EditRow({
  pointage: p,
  chantiers,
  onUpdate,
  onClose,
}: {
  pointage: Pointage;
  chantiers: Chantier[];
  onUpdate: (id: string, formData: FormData) => Promise<void>;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await onUpdate(p.id, formData);
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 capitalize">
          Modifier — {dateFmt.format(new Date(p.date))}
        </h4>
        <button
          onClick={onClose}
          className="text-slate-400 dark:text-slate-500 hover:text-slate-600"
        >
          <X size={14} />
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 px-3 py-2 text-xs text-red-700 dark:text-red-300 mb-2">
          {error}
        </div>
      )}

      <form action={onSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-2">
        <div className="sm:col-span-3">
          <Field label="Jours travaillés" required>
            <Select
              name="joursTravailles"
              defaultValue={String(p.joursTravailles)}
              required
            >
              <option value="0.25">¼ journée</option>
              <option value="0.5">½ journée</option>
              <option value="0.75">¾ journée</option>
              <option value="1">1 journée</option>
              <option value="1.5">1 ½ journée</option>
              <option value="2">2 journées</option>
            </Select>
          </Field>
        </div>
        <div className="sm:col-span-4">
          <Field label="Chantier">
            <Select name="chantierId" defaultValue={p.chantierId ?? ""}>
              <option value="">— Non précisé —</option>
              {chantiers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="sm:col-span-5">
          <Field label="Note (optionnel)">
            <Input
              name="note"
              defaultValue={p.note ?? ""}
              placeholder="Ex: heures sup, rappel..."
            />
          </Field>
        </div>
        <div className="sm:col-span-12 flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={pending}>
            Annuler
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            <Save size={13} />
            {pending ? "..." : "Enregistrer"}
          </Button>
        </div>
      </form>
    </div>
  );
}
