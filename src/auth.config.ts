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

      // Restriction admin : seul un user ADMIN peut accéder à /admin/*
      if (path.startsWith("/admin")) {
        const role = (auth?.user as { role?: string } | undefined)?.role;
        if (role !== "ADMIN") {
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
