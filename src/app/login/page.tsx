import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  const { error, callbackUrl } = await searchParams;

  async function login(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const redirectTo = String(formData.get("callbackUrl") ?? "/dashboard");

    try {
      await signIn("credentials", { email, password, redirectTo });
    } catch (e) {
      if (e instanceof AuthError) {
        const params = new URLSearchParams({
          error: e.type,
          callbackUrl: redirectTo,
        });
        redirect(`/login?${params.toString()}`);
      }
      throw e;
    }
  }

  const errorMessage =
    error === "CredentialsSignin"
      ? "Email ou mot de passe incorrect."
      : error
      ? "Une erreur est survenue. Réessaie."
      : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">Connexion</h1>
        <p className="text-sm text-slate-500 dark:text-slate-500 mb-6">Outil de gestion de chantier</p>

        {errorMessage && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <form action={login} className="space-y-4">
          <input type="hidden" name="callbackUrl" value={callbackUrl ?? "/dashboard"} />

          <label className="block">
            <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              autoFocus
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Mot de passe</span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className="w-full rounded-md border border-slate-300 dark:border-slate-700 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </label>

          <button
            type="submit"
            className="w-full rounded-md bg-brand-500 hover:bg-brand-600 text-white font-medium py-2.5 transition-colors"
          >
            Se connecter
          </button>
        </form>
      </div>
    </div>
  );
}
