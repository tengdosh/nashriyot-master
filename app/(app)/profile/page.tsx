import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/rbac";
import { InfoHint } from "@/components/shared/info-hint";
import { ProfileTelegram } from "./profile-telegram";

export const metadata = { title: "Profil" };

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) return null;
  const link = await prisma.telegramLink.findUnique({ where: { userId: user.id } });

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profil</h1>
        <p className="text-sm text-muted-foreground">{user.name} · {user.email}</p>
      </div>

      <div className="rounded-lg border p-4">
        <div className="mb-1 flex items-center gap-2 text-sm font-medium">
          Telegram bot
          <InfoHint>
            Bot faqat o&apos;qiydi — hisobotlarni Telegram orqali ko&apos;rsatadi, hech nima yozmaydi.
            Ulash uchun botga <code>/ulash 123456</code> deb yuboring.
          </InfoHint>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Bir martalik 6 xonali kod oling va uni botga yuboring. Kod 10 daqiqa amal qiladi.
        </p>
        <ProfileTelegram linked={link != null} chatId={link?.chatId ?? null} />
      </div>
    </div>
  );
}
