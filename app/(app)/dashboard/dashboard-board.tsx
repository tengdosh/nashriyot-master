"use client";

import * as React from "react";
import { toast } from "sonner";
import { Eye, EyeOff, GripVertical, LayoutGrid, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GRID_COLS, MIN_W, type WidgetId, type WidgetLayout } from "@/lib/dashboard";
import { cn } from "@/lib/utils";
import { saveLayoutAction, resetLayoutAction } from "./actions";

export type BoardWidget = { id: WidgetId; w: number; hidden: boolean; title: string; node: React.ReactNode };

/**
 * The 12-column dashboard grid. Ordering, width and show/hide are all client
 * state; widget CONTENT is server-rendered and passed in as `node`, so the
 * board never re-fetches when you drag. Native HTML5 drag-drop keeps it
 * dependency-free (see CLAUDE.md pinned decision).
 */
export function DashboardBoard({ widgets: initial }: { widgets: BoardWidget[] }) {
  const [widgets, setWidgets] = React.useState<BoardWidget[]>(initial);
  const [editing, setEditing] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const dragId = React.useRef<WidgetId | null>(null);

  const nodeById = React.useMemo(() => new Map(initial.map((w) => [w.id, w.node])), [initial]);

  function reorder(target: WidgetId) {
    const from = dragId.current;
    if (!from || from === target) return;
    setWidgets((ws) => {
      const fromIdx = ws.findIndex((w) => w.id === from);
      const toIdx = ws.findIndex((w) => w.id === target);
      if (fromIdx < 0 || toIdx < 0) return ws;
      const next = [...ws];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
    setDirty(true);
  }

  function setWidth(id: WidgetId, w: number) {
    setWidgets((ws) => ws.map((x) => (x.id === id ? { ...x, w } : x)));
    setDirty(true);
  }
  function toggleHidden(id: WidgetId) {
    setWidgets((ws) => ws.map((x) => (x.id === id ? { ...x, hidden: !x.hidden } : x)));
    setDirty(true);
  }

  function save() {
    const layout: WidgetLayout[] = widgets.map((w) => ({ id: w.id, w: w.w, hidden: w.hidden }));
    startTransition(async () => {
      try {
        await saveLayoutAction(layout);
        setDirty(false);
        setEditing(false);
        toast.success("Panel saqlandi");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  function reset() {
    startTransition(async () => {
      try {
        await resetLayoutAction();
        toast.success("Standart layoutga qaytarildi");
        window.location.reload();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  const visible = widgets.filter((w) => !w.hidden || editing);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end gap-2">
        {editing && dirty && (
          <Button size="sm" onClick={save} disabled={pending}>
            <Save className="size-4" /> Saqlash
          </Button>
        )}
        {editing && (
          <Button size="sm" variant="outline" onClick={reset} disabled={pending}>
            <RotateCcw className="size-4" /> Standart
          </Button>
        )}
        <Button size="sm" variant={editing ? "default" : "outline"} onClick={() => setEditing((e) => !e)}>
          <LayoutGrid className="size-4" /> {editing ? "Tayyor" : "Panelni sozlash"}
        </Button>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {visible.map((w) => (
          <div
            key={w.id}
            className={cn(
              "col-span-12",
              COL_SPAN[w.w],
              editing && "rounded-lg outline-dashed outline-1 outline-border",
              w.hidden && "opacity-50",
            )}
            draggable={editing}
            onDragStart={() => (dragId.current = w.id)}
            onDragOver={(e) => editing && e.preventDefault()}
            onDrop={() => editing && reorder(w.id)}
          >
            {editing && (
              <div className="flex items-center justify-between gap-2 rounded-t-lg bg-muted/60 px-2 py-1 text-xs">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <GripVertical className="size-3.5 cursor-grab" /> {w.title}
                </span>
                <span className="flex items-center gap-1">
                  <WidthStepper w={w.w} onChange={(nw) => setWidth(w.id, nw)} />
                  <button
                    type="button"
                    aria-label={w.hidden ? "Koʻrsatish" : "Yashirish"}
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => toggleHidden(w.id)}
                  >
                    {w.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </span>
              </div>
            )}
            <div className={cn(editing && "pointer-events-none select-none p-1")}>{nodeById.get(w.id)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WidthStepper({ w, onChange }: { w: number; onChange: (w: number) => void }) {
  return (
    <span className="flex items-center gap-1">
      <button
        type="button"
        aria-label="Toraytirish"
        className="rounded border px-1 leading-none hover:bg-background disabled:opacity-40"
        disabled={w <= MIN_W}
        onClick={() => onChange(Math.max(w - 3, MIN_W))}
      >
        −
      </button>
      <span className="w-8 text-center tabular-nums">{w}/12</span>
      <button
        type="button"
        aria-label="Kengaytirish"
        className="rounded border px-1 leading-none hover:bg-background disabled:opacity-40"
        disabled={w >= GRID_COLS}
        onClick={() => onChange(Math.min(w + 3, GRID_COLS))}
      >
        +
      </button>
    </span>
  );
}

/** Static Tailwind class per span so the grid columns are known at build time. */
const COL_SPAN: Record<number, string> = {
  3: "lg:col-span-3",
  4: "lg:col-span-4",
  5: "lg:col-span-5",
  6: "lg:col-span-6",
  7: "lg:col-span-7",
  8: "lg:col-span-8",
  9: "lg:col-span-9",
  10: "lg:col-span-10",
  11: "lg:col-span-11",
  12: "lg:col-span-12",
};
