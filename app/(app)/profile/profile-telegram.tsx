"use client";

import * as React from "react";
import { toast } from "sonner";
import { Copy, Link2, Link2Off, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { generateTelegramCodeAction, unlinkTelegramAction } from "./actions";

export function ProfileTelegram({ linked, chatId }: { linked: boolean; chatId: string | null }) {
  const [pending, startTransition] = React.useTransition();
  const [code, setCode] = React.useState<string | null>(null);

  function run(fn: () => Promise<unknown>, success: string) {
    startTransition(async () => {
      try {
        await fn();
        toast.success(success);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm">
        Holat:{" "}
        {linked ? (
          <StatusBadge status="LINKED" tone="success" label={`Ulangan${chatId ? ` (${chatId})` : ""}`} />
        ) : (
          <StatusBadge status="UNLINKED" tone="muted" label="Ulanmagan" />
        )}
      </div>

      {code && (
        <div className="flex items-center justify-between rounded-md border border-dashed bg-muted/40 px-3 py-2">
          <div>
            <div className="text-xs text-muted-foreground">Botga yuboring: <code>/ulash {code}</code></div>
            <div className="font-mono text-2xl font-semibold tracking-widest">{code}</div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              navigator.clipboard?.writeText(code);
              toast.success("Nusxa olindi");
            }}
          >
            <Copy className="size-4" />
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending}
          onClick={() =>
            run(async () => {
              const r = (await generateTelegramCodeAction()) as { code: string };
              setCode(r.code);
            }, "Kod yaratildi")
          }
        >
          <Send className="size-4" /> {code ? "Yangi kod" : "Ulash kodini olish"}
        </Button>
        {linked && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => run(() => unlinkTelegramAction(), "Uzildi")}
          >
            <Link2Off className="size-4" /> Uzish
          </Button>
        )}
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link2 className="size-3.5" /> Bot manzili muhitda <code>TELEGRAM_BOT_USERNAME</code> orqali sozlanadi.
      </p>
    </div>
  );
}
