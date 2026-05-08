"use client";

import { useState, useTransition } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Input";

export function ProfileForm({
  initial,
  action,
}: {
  initial: { name: string; email: string };
  action: (formData: FormData) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  function onSubmit(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      try {
        await action(formData);
        setMessage({ type: "ok", text: "Profil mis à jour" });
      } catch (e) {
        setMessage({
          type: "err",
          text: e instanceof Error ? e.message : "Erreur",
        });
      }
    });
  }

  return (
    <form action={onSubmit} className="space-y-4">
      {message && (
        <div
          className={`rounded-md px-3 py-2 text-sm border ${
            message.type === "ok"
              ? "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-900 text-green-800 dark:text-green-200"
              : "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300"
          }`}
        >
          {message.text}
        </div>
      )}

      <Field label="Nom complet" required>
        <Input
          name="name"
          defaultValue={initial.name}
          required
          minLength={2}
          autoComplete="name"
        />
      </Field>

      <Field label="Email" required>
        <Input
          name="email"
          type="email"
          defaultValue={initial.email}
          required
          autoComplete="email"
        />
      </Field>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          <Save size={14} />
          {pending ? "Enregistrement..." : "Enregistrer"}
        </Button>
      </div>
    </form>
  );
}

export function PasswordForm({
  action,
}: {
  action: (formData: FormData) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [formKey, setFormKey] = useState(0);

  function onSubmit(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      try {
        await action(formData);
        setMessage({ type: "ok", text: "Mot de passe modifié" });
        setFormKey((k) => k + 1); // reset les champs
      } catch (e) {
        setMessage({
          type: "err",
          text: e instanceof Error ? e.message : "Erreur",
        });
      }
    });
  }

  return (
    <form key={formKey} action={onSubmit} className="space-y-4">
      {message && (
        <div
          className={`rounded-md px-3 py-2 text-sm border ${
            message.type === "ok"
              ? "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-900 text-green-800 dark:text-green-200"
              : "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300"
          }`}
        >
          {message.text}
        </div>
      )}

      <Field label="Mot de passe actuel" required>
        <Input
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
        />
      </Field>

      <Field label="Nouveau mot de passe" required hint="8 caractères minimum">
        <Input
          name="newPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </Field>

      <Field label="Confirmer le nouveau mot de passe" required>
        <Input
          name="newPasswordConfirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </Field>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          <Save size={14} />
          {pending ? "Modification..." : "Changer le mot de passe"}
        </Button>
      </div>
    </form>
  );
}
