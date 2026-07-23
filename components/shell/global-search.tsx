"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/shared/status-badge";

type Result = { id: string; workTitle: string; status: string; ownerType: string };

// ⌘K global search, wired to the titles tsvector index (spec v1 §5.1).
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<Result[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/search?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        setResults(json.data ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  function go(id: string) {
    setOpen(false);
    setQ("");
    setResults([]);
    router.push(`/titles/${id}`);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ml-4 hidden h-8 w-64 items-center gap-2 rounded-md border bg-muted/40 px-2.5 text-sm text-muted-foreground sm:flex"
      >
        <Search className="size-4" /> Qidirish…
        <kbd className="ml-auto rounded bg-background px-1.5 py-0.5 text-xs">⌘K</kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false} className="top-24 translate-y-0 gap-0 p-0 sm:max-w-lg">
          <DialogTitle className="sr-only">Qidiruv</DialogTitle>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 text-muted-foreground" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Sarlavha qidirish…"
              className="h-11 border-0 focus-visible:ring-0"
            />
          </div>
          <div className="max-h-80 overflow-y-auto p-1.5">
            {loading && <div className="px-3 py-2 text-sm text-muted-foreground">Qidirilmoqda…</div>}
            {!loading && q.trim() && results.length === 0 && (
              <div className="px-3 py-2 text-sm text-muted-foreground">Natija topilmadi</div>
            )}
            {results.map((r) => (
              <button
                key={r.id}
                onClick={() => go(r.id)}
                className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span className="font-medium">{r.workTitle}</span>
                <StatusBadge status={r.status} />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
