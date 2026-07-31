import { prisma } from "@/lib/db";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

export async function isRateLimited(ip: string, email: string): Promise<boolean> {
  const key = `${ip}:${email.toLowerCase()}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + WINDOW_MS);

  const existing = await prisma.loginAttempt.findUnique({ where: { key } });

  if (!existing || existing.expiresAt < now) {
    await prisma.loginAttempt.upsert({
      where: { key },
      update: { count: 1, firstAt: now, expiresAt },
      create: { key, count: 1, firstAt: now, expiresAt },
    });
    return false;
  }

  if (existing.count >= MAX_ATTEMPTS) return true;

  await prisma.loginAttempt.update({
    where: { key },
    data: { count: { increment: 1 } },
  });
  return false;
}

export function maybeCleanExpired(): void {
  if (Math.random() > 0.01) return;
  prisma.loginAttempt
    .deleteMany({ where: { expiresAt: { lt: new Date() } } })
    .catch(() => {});
}
