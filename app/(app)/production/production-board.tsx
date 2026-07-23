"use client";

import * as React from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createTaskAction, setTaskStatusAction } from "./actions";
import type { TaskStatus } from "@prisma/client";

const COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: "PLANNED", label: "Reja" },
  { key: "IN_PROGRESS", label: "Jarayonda" },
  { key: "IN_REVIEW", label: "Tekshiruvda" },
  { key: "DONE", label: "Tayyor" },
];
const ORDER = COLUMNS.map((c) => c.key);

export type TaskRow = {
  id: string;
  name: string;
  status: TaskStatus;
  title: string;
  assignee: string | null;
  dependsOn: string | null;
  dueDate: string | null;
};

export function ProductionBoard({
  tasks,
  titles,
  canWrite,
}: {
  tasks: TaskRow[];
  titles: { id: string; workTitle: string }[];
  canWrite: boolean;
}) {
  const [pending, startTransition] = React.useTransition();
  const [showAdd, setShowAdd] = React.useState(false);
  const [titleId, setTitleId] = React.useState(titles[0]?.id ?? "");
  const [name, setName] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");

  function move(t: TaskRow, dir: 1 | -1) {
    const next = ORDER[ORDER.indexOf(t.status) + dir];
    if (!next) return;
    startTransition(async () => {
      try {
        await setTaskStatusAction(t.id, next);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  function add() {
    if (!name.trim() || !titleId) return;
    startTransition(async () => {
      try {
        await createTaskAction({ titleId, name: name.trim(), dueDate: dueDate || null });
        setName("");
        setDueDate("");
        setShowAdd(false);
        toast.success("Vazifa qoʻshildi");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  const now = Date.now();

  return (
    <div className="flex flex-col gap-3">
      {canWrite && (
        <div>
          {showAdd ? (
            <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
              <div className="flex flex-col gap-1.5">
                <Label>Asar</Label>
                <Select value={titleId} onValueChange={(v) => setTitleId(v ?? "")}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {titles.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.workTitle}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <Label>Vazifa</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Masalan: Muqova dizayni" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Muddat</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <Button onClick={add} disabled={pending}>
                Qoʻshish
              </Button>
              <Button variant="ghost" onClick={() => setShowAdd(false)}>
                Bekor
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
              <Plus className="size-4" /> Yangi vazifa
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        {COLUMNS.map((col) => {
          const items = tasks.filter((t) => t.status === col.key);
          return (
            <div key={col.key} className="flex flex-col gap-2 rounded-lg bg-muted/40 p-2">
              <div className="px-1 text-sm font-medium">
                {col.label} <span className="text-muted-foreground">({items.length})</span>
              </div>
              {items.map((t) => {
                const overdue =
                  t.dueDate && t.status !== "DONE" && new Date(t.dueDate).getTime() < now;
                return (
                  <div key={t.id} className="flex flex-col gap-1 rounded-lg border bg-card p-2.5">
                    <div className="text-sm font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.title}</div>
                    {t.dependsOn && (
                      <div className="text-xs text-muted-foreground">↳ {t.dependsOn}</div>
                    )}
                    <div className="mt-1 flex items-center justify-between">
                      <span
                        className={cn(
                          "text-xs",
                          overdue ? "font-medium text-destructive" : "text-muted-foreground",
                        )}
                      >
                        {t.dueDate ? formatDate(t.dueDate) : "—"}
                        {overdue ? " (kechikkan)" : ""}
                      </span>
                      {canWrite && (
                        <div className="flex gap-0.5">
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            disabled={pending || ORDER.indexOf(t.status) === 0}
                            onClick={() => move(t, -1)}
                          >
                            <ChevronLeft className="size-4" />
                          </Button>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            disabled={pending || ORDER.indexOf(t.status) === ORDER.length - 1}
                            onClick={() => move(t, 1)}
                          >
                            <ChevronRight className="size-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {items.length === 0 && <div className="px-1 py-4 text-center text-xs text-muted-foreground">—</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
