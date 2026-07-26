"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/status-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/format";

export type AuditRow = {
  id: string;
  entity: string;
  entityId: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  actor: string;
  createdAt: string;
  summary: string;
  changes: { field: string; from: string; to: string }[];
};

const ACTION_TONE = { CREATE: "success", UPDATE: "info", DELETE: "danger" } as const;
const ALL = "__all__";

export function AuditClient({ rows, entities, selected }: { rows: AuditRow[]; entities: string[]; selected: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState<Set<string>>(new Set());

  function toggle(id: string) {
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <Label>Jadval boʻyicha filtr</Label>
          <Select
            value={selected || ALL}
            onValueChange={(v) => router.push(v && v !== ALL ? `/admin/audit?entity=${v}` : "/admin/audit")}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Barchasi" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Barcha jadvallar</SelectItem>
              {entities.map((e) => (
                <SelectItem key={e} value={e}>{e}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="pb-2 text-sm text-muted-foreground">{rows.length} yozuv</span>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Sana</TableHead>
              <TableHead>Jadval</TableHead>
              <TableHead>Amal</TableHead>
              <TableHead>Kim</TableHead>
              <TableHead>Xulosa</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Yozuv yoʻq</TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
              const isOpen = open.has(r.id);
              const expandable = r.action === "UPDATE" && r.changes.length > 0;
              return (
                <React.Fragment key={r.id}>
                  <TableRow className={expandable ? "cursor-pointer" : ""} onClick={() => expandable && toggle(r.id)}>
                    <TableCell>{expandable ? (isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />) : null}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{formatDate(r.createdAt)}</TableCell>
                    <TableCell className="font-mono text-xs">{r.entity}</TableCell>
                    <TableCell>
                      <StatusBadge status={r.action} tone={ACTION_TONE[r.action]} label={r.action} />
                    </TableCell>
                    <TableCell className="text-sm">{r.actor}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.summary}</TableCell>
                  </TableRow>
                  {isOpen && expandable && (
                    <TableRow>
                      <TableCell colSpan={6} className="bg-muted/30">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-muted-foreground">
                              <th className="p-1 text-left">Maydon</th>
                              <th className="p-1 text-left">Avval</th>
                              <th className="p-1 text-left">Keyin</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.changes.map((c) => (
                              <tr key={c.field} className="border-t">
                                <td className="p-1 font-mono">{c.field}</td>
                                <td className="p-1 text-destructive">{c.from}</td>
                                <td className="p-1 text-success">{c.to}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
