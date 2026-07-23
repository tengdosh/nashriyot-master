"use client";

import * as React from "react";
import { FormProvider, type FieldValues, type UseFormReturn } from "react-hook-form";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

/**
 * Generic side-panel form (spec §4.3/§4.1: forms are a right-side FormSheet, not
 * a modal). Host a react-hook-form instance; fields inside can use useFormContext.
 */
export function FormSheet<T extends FieldValues>({
  open,
  onOpenChange,
  title,
  description,
  form,
  onSubmit,
  submitLabel = "Saqlash",
  cancelLabel = "Bekor qilish",
  side = "right",
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  form: UseFormReturn<T>;
  onSubmit: (values: T) => void | Promise<void>;
  submitLabel?: string;
  cancelLabel?: string;
  side?: "right" | "left";
  children: React.ReactNode;
}) {
  const submitting = form.formState.isSubmitting;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={side} className="w-full sm:max-w-md">
        <FormProvider {...form}>
          <form
            onSubmit={form.handleSubmit(async (values) => {
              await onSubmit(values);
            })}
            className="flex h-full flex-col"
          >
            <SheetHeader>
              <SheetTitle>{title}</SheetTitle>
              {description && <SheetDescription>{description}</SheetDescription>}
            </SheetHeader>

            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-2">{children}</div>

            <SheetFooter className="flex-row justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {cancelLabel}
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "…" : submitLabel}
              </Button>
            </SheetFooter>
          </form>
        </FormProvider>
      </SheetContent>
    </Sheet>
  );
}
