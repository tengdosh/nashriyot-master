"use client";

import * as React from "react";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Small info icon with a tooltip — spec §4.4: every computed number gets an
 * info tooltip showing its formula inputs.
 */
export function InfoHint({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label="Maʼlumot"
            className={cn("inline-flex text-muted-foreground hover:text-foreground", className)}
          />
        }
      >
        <Info className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent>{children}</TooltipContent>
    </Tooltip>
  );
}
