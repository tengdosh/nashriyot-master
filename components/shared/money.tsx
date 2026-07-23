"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { formatNumber, formatUZS, parseMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Read-only money display: "12 000 000 so'm". */
export function MoneyText({
  value,
  suffix = true,
  className,
}: {
  value: number | string;
  suffix?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("tabular-nums", className)}>
      {suffix ? formatUZS(value) : formatNumber(value)}
    </span>
  );
}

/** Controlled money input; formats with thousands spaces, emits a plain number. */
export function MoneyInput({
  value,
  onValueChange,
  className,
  id,
  name,
  placeholder,
  disabled,
}: {
  value: number | null | undefined;
  onValueChange: (value: number) => void;
  className?: string;
  id?: string;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const display = value == null || Number.isNaN(value) ? "" : formatNumber(value);
  return (
    <div className="relative">
      <Input
        id={id}
        name={name}
        inputMode="numeric"
        placeholder={placeholder}
        disabled={disabled}
        value={display}
        onChange={(e) => onValueChange(parseMoney(e.target.value))}
        className={cn("pr-12 text-right tabular-nums", className)}
      />
      <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">
        so&apos;m
      </span>
    </div>
  );
}
