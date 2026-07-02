"use client";

import { useState, useTransition } from "react";
import { Loader2, X } from "lucide-react";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Input";
import { createChannel } from "../server/channel-actions";
import type { ChannelVisibility } from "../core/types";

/** Libellés français des visibilités proposées à la création. */
const VISIBILITY_OPTIONS: { value: ChannelVisibility; label: string }[] = [
  { value: "INTERNE", label: "Interne (équipe uniquement)" },
  { value: "CLIENT", label: "Ouvert au client" },
  { value: "SOUS_TRAITANT", label: "Ouvert aux sous-traitants" },
];

/**
 * Petit dialogue de création de canal (nom + visibilité). Appelle la
 * server action createChannel ; les erreurs (doublon, validation) sont
 * remontées en toast. Réservé aux admins / conducteurs : le parent ne
 * doit l'ouvrir que si canCreateChannel(user) est vrai.
 */
export function ChannelCreateDialog({
  projectId,
  open,
  onClose,
  onCreated,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
  /** Appelé après création réussie avec l'id du nouveau canal. */
  onCreated?: (channelId: string) => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [nom, setNom] = useState("");
  const [visibility, setVisibility] = useState<ChannelVisibility>("INTERNE");

  if (!open) return null;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const cleaned = nom.trim();
    if (!cleaned) {
      toast.error("Le nom du canal est requis");
      return;
    }
    startTransition(async () => {
      try {
        const canal = await createChannel(projectId, cleaned, visibility);
        toast.success(`Canal "${canal.nom}" créé`);
        setNom("");
        setVisibility("INTERNE");
        onCreated?.(canal.id);
        onClose();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Création du canal impossible"
        );
      }
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Nouveau canal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-border-default bg-card p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">
            Nouveau canal
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Nom du canal" required>
            <Input
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              maxLength={40}
              placeholder="Gros oeuvre, Coordination client..."
              autoFocus
            />
          </Field>

          <Field
            label="Visibilité"
            hint="Interne = équipe seulement. Les canaux ouverts sont visibles par les comptes externes rattachés au chantier."
          >
            <Select
              value={visibility}
              onChange={(e) =>
                setVisibility(e.target.value as ChannelVisibility)
              }
            >
              {VISIBILITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={pending}
            >
              Annuler
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending && <Loader2 size={14} className="animate-spin" />}
              Créer le canal
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
