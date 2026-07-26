"use client";

import * as React from "react";
import { toast } from "sonner";
import { Lock, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/shared/status-badge";
import { setRolePermsAction } from "../actions";

type Role = { code: string; name: string; system: boolean };
type Module = { module: string; codes: string[] };

export function RolesMatrix({
  roles,
  modules,
  matrix,
  canWrite,
}: {
  roles: Role[];
  modules: Module[];
  matrix: Record<string, string[]>;
  canWrite: boolean;
}) {
  const [pending, startTransition] = React.useTransition();
  // Working copy: roleCode → Set(permCode).
  const [grid, setGrid] = React.useState<Record<string, Set<string>>>(() =>
    Object.fromEntries(roles.map((r) => [r.code, new Set(matrix[r.code] ?? [])])),
  );
  const [dirty, setDirty] = React.useState<Set<string>>(new Set());

  function toggle(roleCode: string, permCode: string, system: boolean) {
    if (system || !canWrite) return;
    setGrid((g) => {
      const next = new Set(g[roleCode]);
      if (next.has(permCode)) next.delete(permCode);
      else next.add(permCode);
      return { ...g, [roleCode]: next };
    });
    setDirty((d) => new Set(d).add(roleCode));
  }

  function saveRole(roleCode: string) {
    startTransition(async () => {
      try {
        await setRolePermsAction({ roleCode, permCodes: [...grid[roleCode]] });
        setDirty((d) => {
          const n = new Set(d);
          n.delete(roleCode);
          return n;
        });
        toast.success(`${roleCode} saqlandi`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="sticky left-0 z-10 bg-muted/50 p-2 text-left">Ruxsat</th>
            {roles.map((r) => (
              <th key={r.code} className="p-2 text-center align-bottom">
                <div className="flex flex-col items-center gap-1">
                  <span className="whitespace-nowrap text-xs font-medium">{r.name}</span>
                  {r.system ? (
                    <Lock className="size-3 text-muted-foreground" aria-label="tizim roli" />
                  ) : dirty.has(r.code) && canWrite ? (
                    <Button size="sm" variant="ghost" className="h-6 px-1" disabled={pending} onClick={() => saveRole(r.code)}>
                      <Save className="size-3" />
                    </Button>
                  ) : (
                    <span className="h-6" />
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {modules.map((m) => (
            <React.Fragment key={m.module}>
              <tr className="border-t bg-muted/20">
                <td colSpan={roles.length + 1} className="p-1.5 pl-2 text-xs font-semibold uppercase text-muted-foreground">
                  {m.module}
                </td>
              </tr>
              {m.codes.map((code) => (
                <tr key={code} className="border-t hover:bg-muted/20">
                  <td className="sticky left-0 z-10 bg-background p-2 font-mono text-xs">{code}</td>
                  {roles.map((r) => (
                    <td key={r.code} className="p-2 text-center">
                      <Checkbox
                        checked={grid[r.code]?.has(code) ?? false}
                        disabled={r.system || !canWrite}
                        onCheckedChange={() => toggle(r.code, code, r.system)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-2 border-t p-2 text-xs text-muted-foreground">
        <StatusBadge status="SYS" tone="muted" label="Lock = tizim roli" /> oʻzgartirilmaydi. Har rol alohida
        saqlanadi.
      </div>
    </div>
  );
}
