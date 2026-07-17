import { NextResponse } from "next/server";
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    authorized: ({ auth, request }) => {
      const isLoggedIn = !!auth?.user;
      const path = request.nextUrl.pathname;

      // Pages publiques (accessibles sans login)
      const isPublic =
        path.startsWith("/login") ||
        path.startsWith("/register") ||
        path.startsWith("/forgot-password") ||
        path.startsWith("/reset-password") ||
        path.startsWith("/api/auth");

      // Coquille PWA : le service worker, le manifest, les icônes et la
      // page hors-ligne doivent rester servis sans session, sinon un
      // utilisateur déconnecté ne reçoit plus les mises à jour du SW
      // (GET /sw.js redirigé 307 vers /login). Correspondances exactes
      // pour les fichiers afin de ne pas ouvrir d'autres routes.
      const isPwaShell =
        path === "/sw.js" ||
        path === "/manifest.webmanifest" ||
        path === "/offline" ||
        path.startsWith("/icons/") ||
        path.startsWith("/brand/");

      if (isPublic || isPwaShell) return true;

      if (!isLoggedIn) return false;

      // Restriction admin : seul un user ADMIN peut accéder à /admin/*,
      // /paie/* et /parametres/* (zones financières / configuration).
      const role = (auth?.user as { role?: string } | undefined)?.role;
      const isAdminOnly =
        path.startsWith("/admin") ||
        path.startsWith("/paie") ||
        path.startsWith("/parametres") ||
        path.startsWith("/api/export/paiements");
      if (isAdminOnly && role !== "ADMIN") {
        return NextResponse.redirect(new URL("/aujourdhui", request.nextUrl));
      }

      // Restrictions CLIENT : un client ne peut voir que sa page du jour
      // (/aujourdhui, qui lui sert sa vue dédiée), ses chantiers, rapports,
      // incidents, ses documents à signer et son profil. Tout le reste est
      // bloqué (y compris /dashboard et /accueil, redirigés ici).
      if (role === "CLIENT") {
        const clientAllowedRoots = [
          "/aujourdhui",
          "/chantiers",
          "/rapports",
          "/incidents",
          "/mes-documents",
          "/profil",
        ];
        const isClientAllowed = clientAllowedRoots.some(
          (r) => path === r || path.startsWith(r + "/")
        );
        if (!isClientAllowed) {
          return NextResponse.redirect(new URL("/aujourdhui", request.nextUrl));
        }
      }

      return true;
    },
    jwt: ({ token, user }) => {
      if (user) {
        token.role = (user as { role?: string }).role;
      }
      return token;
    },
    session: ({ session, token }) => {
      if (token.sub) session.user.id = token.sub;
      const role = (token as { role?: string }).role;
      if (role) {
        (session.user as { role?: string }).role = role;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
