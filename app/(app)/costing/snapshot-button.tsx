"use client";

import * as React from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { snapshotAllAction } from "./actions";

export function SnapshotButton() {
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const r = (await snapshotAllAction()) as { snapshotted: number; alerts: number };
            toast.success(`Suratlar: ${r.snapshotted} SKU · ${r.alerts} ogohlantirish`);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Xatolik");
          }
        })
      }
    >
      <RefreshCw className="size-4" /> Suratga olish
    </Button>
  );
}
