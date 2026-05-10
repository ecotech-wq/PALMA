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

      if (isPublic) return true;

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
        return NextResponse.redirect(new URL("/dashboard", request.nextUrl));
      }

      // Restrictions CLIENT : un client ne peut voir que dashboard,
      // chantiers, rapports, incidents et son profil. Tout le reste
      // est bloqué.
      if (role === "CLIENT") {
        const clientAllowedRoots = [
          "/dashboard",
          "/chantiers",
          "/rapports",
          "/incidents",
          "/profil",
        ];
        const isClientAllowed = clientAllowedRoots.some(
          (r) => path === r || path.startsWith(r + "/")
        );
        if (!isClientAllowed) {
          return NextResponse.redirect(new URL("/dashboard", request.nextUrl));
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
