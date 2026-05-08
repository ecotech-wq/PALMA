import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/auth";
import { BrandLockup } from "@/components/BrandLockup";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    callbackUrl?: string;
    registered?: string;
    reset?: string;
  }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  const { error, callbackUrl, registered, reset } = await searchParams;

  async function login(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const redirectTo = String(formData.get("callbackUrl") ?? "/dashboard");

    try {
      await signIn("credentials", { email, password, redirectTo });
    } catch (e) {
      if (e instanceof AuthError) {
        // e.code peut être "AccountPending" ou "AccountRevoked" si on l'a customisé
        // sinon e.type vaut "CredentialsSignin"
        const code =
          (e as AuthError & { code?: string }).code ?? e.type ?? "CredentialsSignin";
        const params = new URLSearchParams({ error: code, callbackUrl: redirectTo });
        redirect(`/login?${params.toString()}`);
      }
      throw e;
    }
  }

  let errorMessage: string | null = null;
  if (error === "AccountPending") {
    errorMessage =
      "Ton compte est en attente de validation par un administrateur.";
  } else if (error === "AccountRevoked") {
    errorMessage =
      "Ton compte a été désactivé. Contacte un administrateur si c'est une erreur.";
  } else if (error === "CredentialsSignin" || error === "credentials") {
    errorMessage = "Email ou mot de passe incorrect.";
  } else if (error) {
    errorMessage = "Une erreur est survenue. Réessaie.";
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4 py-8">
      <div className="w-full max-w-sm">
        <BrandLockup tagline="Connecte-toi à ton espace" />

        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
          {registered === "1" && (
            <div className="mb-4 rounded-md border border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-900 px-3 py-2 text-sm text-green-800 dark:text-green-200">
              Compte créé. En attente de validation par un administrateur.
            </div>
          )}

          {reset === "1" && (
            <div className="mb-4 rounded-md border border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-900 px-3 py-2 text-sm text-green-800 dark:text-green-200">
              Mot de passe modifié. Tu peux maintenant te connecter.
            </div>
          )}

          {errorMessage && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-900 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              {errorMessage}
            </div>
          )}

          <form action={login} className="space-y-4">
            <input type="hidden" name="callbackUrl" value={callbackUrl ?? "/dashboard"} />

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

            <label className="block">
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Mot de passe
              </span>
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </label>

            <button
              type="submit"
              className="w-full rounded-md bg-brand-500 hover:bg-brand-600 text-white font-medium py-2.5 transition-colors"
            >
              Se connecter
            </button>

            <div className="text-right text-xs">
              <Link
                href="/forgot-password"
                className="text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-700 hover:underline"
              >
                Mot de passe oublié ?
              </Link>
            </div>
          </form>

          <div className="mt-5 pt-5 border-t border-slate-200 dark:border-slate-800 text-center text-sm">
            <span className="text-slate-500 dark:text-slate-400">Pas encore de compte ? </span>
            <Link
              href="/register"
              className="text-brand-600 dark:text-brand-700 hover:underline font-medium"
            >
              Créer un compte
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
