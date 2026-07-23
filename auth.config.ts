import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js config: no Node-only deps (no Prisma, no argon2), so it can
 * be used by middleware.ts. The Credentials provider (which needs Prisma+argon2)
 * is added in auth.ts. The jwt/session callbacks only move data around, so they
 * are shared and edge-safe.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  trustHost: true,
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.roles = user.roles ?? [];
        token.permissions = user.permissions ?? [];
        token.entityAccess = user.entityAccess ?? [];
        token.contributorId = user.contributorId ?? null;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.uid as string) ?? (token.sub as string);
        session.user.roles = (token.roles as string[]) ?? [];
        session.user.permissions = (token.permissions as string[]) ?? [];
        session.user.entityAccess = (token.entityAccess as string[]) ?? [];
        session.user.contributorId = (token.contributorId as string | null) ?? null;
      }
      return session;
    },
  },
  providers: [], // Credentials added in auth.ts (Node runtime)
} satisfies NextAuthConfig;
