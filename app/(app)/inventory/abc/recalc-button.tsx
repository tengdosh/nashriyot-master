"use client";

import * as React from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { recalcAbcAction } from "../actions";

/** Persists Product.abcClass now instead of waiting for the 03:00 job. */
export function RecalcAbcButton() {
  const [pending, startTransition] = React.useTransition();

  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const res = (await recalcAbcAction()) as { counts: Record<string, number> };
            toast.success(`ABC yangilandi — A:${res.counts.A} B:${res.counts.B} C:${res.counts.C}`);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Xatolik");
          }
        })
      }
    >
      <RefreshCw className="size-4" /> Qayta hisoblash
    </Button>
  );
}
