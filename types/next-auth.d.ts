import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      roles: string[];
      permissions: string[];
      entityAccess: string[];
      contributorId?: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    roles?: string[];
    permissions?: string[];
    entityAccess?: string[];
    contributorId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    roles?: string[];
    permissions?: string[];
    entityAccess?: string[];
    contributorId?: string | null;
  }
}
