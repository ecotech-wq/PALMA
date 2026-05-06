import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    authorized: ({ auth, request }) => {
      const isLoggedIn = !!auth?.user;
      const isOnLogin = request.nextUrl.pathname.startsWith("/login");
      const isOnApi = request.nextUrl.pathname.startsWith("/api/auth");

      if (isOnLogin || isOnApi) return true;
      return isLoggedIn;
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
