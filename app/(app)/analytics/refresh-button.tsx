"use client";

import * as React from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { refreshViewsAction } from "./actions";

/** Manual materialized-view refresh; the nightly chain does it automatically. */
export function RefreshViewsButton() {
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const r = (await refreshViewsAction()) as { refreshed: string[] };
            toast.success(`Yangilandi: ${r.refreshed.length} koʻrinish`);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Xatolik");
          }
        })
      }
    >
      <RefreshCw className="size-4" /> Koʻrinishlarni yangilash
    </Button>
  );
}
