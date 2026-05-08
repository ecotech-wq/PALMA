import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/password-reset";
import { BrandLockup } from "@/components/BrandLockup";
import { performPasswordReset } from "./actions";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string; invalid?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  const { token, error, invalid } = await searchParams;

  // Lien explicitement marqué invalide
  if (invalid === "1" || !token) {
    return <InvalidTokenView />;
  }

  // Vérifie que le token est bien actif (sans le consumer)
  const tokenHash = hashToken(token);
  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash },
  });
  const isValid = !!(
    record &&
    !record.usedAt &&
    record.expiresAt > new Date()
  );

  if (!isValid) {
    return <InvalidTokenView />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4 py-8">
      <div className="w-full max-w-sm">
        <BrandLockup tagline="Nouveau mot de passe" />

        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            Choisis ton nouveau mot de passe. Tu seras ensuite redirigé vers la
            connexion.
          </p>

          {error && (
            <div className="mb-4 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <form action={performPasswordReset} className="space-y-4">
            <input type="hidden" name="token" value={token} />

            <label className="block">
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Nouveau mot de passe
              </span>
              <input
                type="password"
                name="password"
                required
                minLength={8}
                autoFocus
                autoComplete="new-password"
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
              <span className="block text-xs text-slate-500 dark:text-slate-400 mt-1">
                8 caractères minimum
              </span>
            </label>

            <label className="block">
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Confirmer le mot de passe
              </span>
              <input
                type="password"
                name="passwordConfirm"
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </label>

            <button
              type="submit"
              className="w-full rounded-md bg-brand-500 hover:bg-brand-600 text-white font-medium py-2.5 transition-colors"
            >
              Définir le nouveau mot de passe
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function InvalidTokenView() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4 py-8">
      <div className="w-full max-w-sm">
        <BrandLockup tagline="Lien invalide" />

        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 text-center">
          <p className="text-sm text-slate-700 dark:text-slate-300 mb-4">
            Ce lien de réinitialisation est <strong>invalide</strong> ou{" "}
            <strong>expiré</strong>. Demande-en un nouveau.
          </p>

          <Link
            href="/forgot-password"
            className="inline-block rounded-md bg-brand-500 hover:bg-brand-600 text-white font-medium px-4 py-2 transition-colors"
          >
            Demander un nouveau lien
          </Link>

          <div className="mt-5 pt-5 border-t border-slate-200 dark:border-slate-800 text-sm">
            <Link
              href="/login"
              className="text-brand-600 dark:text-brand-700 hover:underline font-medium"
            >
              ← Retour à la connexion
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
