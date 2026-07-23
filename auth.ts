import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verify } from "@node-rs/argon2";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { prisma } from "@/lib/db";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({
          where: { email },
          include: {
            entityAccess: { select: { id: true } },
            roles: {
              include: {
                role: {
                  include: { permissions: { include: { permission: true } } },
                },
              },
            },
          },
        });
        if (!user || !user.isActive) return null;

        const ok = await verify(user.passwordHash, password);
        if (!ok) return null;

        const roles = user.roles.map((r) => r.role.code);
        const permissions = Array.from(
          new Set(user.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.code))),
        );
        const entityAccess = user.entityAccess.map((e) => e.id);

        return {
          id: user.id,
          email: user.email,
          name: user.fullName,
          roles,
          permissions,
          entityAccess,
          contributorId: user.contributorId,
        };
      },
    }),
  ],
});
