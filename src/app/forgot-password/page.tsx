import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BrandLockup } from "@/components/BrandLockup";
import { requestPasswordReset } from "./actions";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  const { error, sent } = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4 py-8">
      <div className="w-full max-w-sm">
        <BrandLockup tagline="Mot de passe oublié" />

        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
          {sent === "1" ? (
            <>
              <div className="rounded-md border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950 px-3 py-3 text-sm text-green-800 dark:text-green-200">
                <p className="font-medium">Demande enregistrée</p>
                <p className="mt-1 text-green-700 dark:text-green-300">
                  Si un compte existe avec cet email, un lien de réinitialisation a
                  été envoyé. Vérifie ta boîte mail (et tes spams).
                </p>
                <p className="mt-2 text-green-700 dark:text-green-300 text-xs">
                  Si tu ne reçois rien, contacte un administrateur — il pourra te
                  fournir le lien manuellement.
                </p>
              </div>
              <div className="mt-5 text-center text-sm">
                <Link
                  href="/login"
                  className="text-brand-600 dark:text-brand-700 hover:underline font-medium"
                >
                  ← Retour à la connexion
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                Entre l&apos;email associé à ton compte. Tu recevras un lien pour
                définir un nouveau mot de passe.
              </p>

              {error && (
                <div className="mb-4 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                  {error}
                </div>
              )}

              <form action={requestPasswordReset} className="space-y-4">
                <label className="block">
                  <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Email
                  </span>
                  <input
                    type="email"
                    name="email"
                    required
                    autoComplete="email"
                    autoFocus
                    className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                </label>

                <button
                  type="submit"
                  className="w-full rounded-md bg-brand-500 hover:bg-brand-600 text-white font-medium py-2.5 transition-colors"
                >
                  Envoyer le lien
                </button>
              </form>

              <div className="mt-5 pt-5 border-t border-slate-200 dark:border-slate-800 text-center text-sm">
                <Link
                  href="/login"
                  className="text-brand-600 dark:text-brand-700 hover:underline font-medium"
                >
                  ← Retour à la connexion
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
