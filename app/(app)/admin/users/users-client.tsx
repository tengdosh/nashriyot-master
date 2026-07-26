"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import { KeyRound, Plus, UserPlus } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  inviteUserAction,
  setUserActiveAction,
  resetPasswordAction,
  setUserRolesAction,
} from "../actions";

export type UserRow = {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  archived: boolean;
  roleCode: string;
  roleName: string;
  entityIds: string[];
  entityNames: string[];
};

export type RefData = {
  roles: { code: string; name: string }[];
  entities: { id: string; name: string }[];
};

export function UsersClient({ rows, refs }: { rows: UserRow[]; refs: RefData }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [mode, setMode] = React.useState<"invite" | "edit" | null>(null);
  const [editing, setEditing] = React.useState<UserRow | null>(null);
  const [tempPw, setTempPw] = React.useState<string | null>(null);

  const [email, setEmail] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [roleCode, setRoleCode] = React.useState(refs.roles[0]?.code ?? "");
  const [entityIds, setEntityIds] = React.useState<string[]>([]);

  function openInvite() {
    setMode("invite");
    setEditing(null);
    setEmail("");
    setFullName("");
    setRoleCode(refs.roles[0]?.code ?? "");
    setEntityIds([]);
    setTempPw(null);
  }
  function openEdit(u: UserRow) {
    setMode("edit");
    setEditing(u);
    setRoleCode(u.roleCode || refs.roles[0]?.code || "");
    setEntityIds(u.entityIds);
    setTempPw(null);
  }

  function toggleEntity(id: string) {
    setEntityIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function submit() {
    startTransition(async () => {
      try {
        if (mode === "invite") {
          const { tempPassword } = await inviteUserAction({ email, fullName, roleCode, entityIds });
          setTempPw(tempPassword); // show once, keep the sheet open
          toast.success("Foydalanuvchi taklif qilindi");
          router.refresh();
        } else if (mode === "edit" && editing) {
          await setUserRolesAction({ userId: editing.id, roleCode, entityIds });
          toast.success("Saqlandi");
          setMode(null);
          router.refresh();
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  function toggleActive(u: UserRow) {
    startTransition(async () => {
      try {
        await setUserActiveAction(u.id, !u.isActive);
        toast.success(u.isActive ? "Faolsizlantirildi" : "Faollashtirildi");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  function reset(u: UserRow) {
    startTransition(async () => {
      try {
        const { tempPassword } = await resetPasswordAction(u.id);
        setEditing(u);
        setTempPw(tempPassword);
        setMode("edit");
        setRoleCode(u.roleCode);
        setEntityIds(u.entityIds);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  const columns = React.useMemo<ColumnDef<UserRow>[]>(
    () => [
      {
        accessorKey: "fullName",
        header: "Foydalanuvchi",
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium">{row.original.fullName}</span>
            <span className="text-xs text-muted-foreground">{row.original.email}</span>
          </div>
        ),
      },
      { accessorKey: "roleName", header: "Rol" },
      {
        accessorKey: "entityNames",
        header: "Sub'ektlar",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.entityNames.length ? row.original.entityNames.join(", ") : "—"}
          </span>
        ),
      },
      {
        accessorKey: "isActive",
        header: "Holat",
        cell: ({ row }) =>
          row.original.archived ? (
            <StatusBadge status="ARCHIVED" tone="muted" label="Arxivlangan" />
          ) : (
            <StatusBadge
              status={row.original.isActive ? "ACTIVE" : "OFF"}
              tone={row.original.isActive ? "success" : "muted"}
              label={row.original.isActive ? "Faol" : "Faolsiz"}
            />
          ),
      },
      {
        id: "Amallar",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={() => openEdit(row.original)}>
              Tahrir
            </Button>
            <Button variant="ghost" size="sm" onClick={() => reset(row.original)} title="Parolni tiklash">
              <KeyRound className="size-4" />
            </Button>
            {!row.original.archived && (
              <Button variant="ghost" size="sm" onClick={() => toggleActive(row.original)}>
                {row.original.isActive ? "Oʻchirish" : "Yoqish"}
              </Button>
            )}
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <>
      <div>
        <Button onClick={openInvite}>
          <UserPlus className="size-4" /> Foydalanuvchi taklif qilish
        </Button>
      </div>

      <DataTable columns={columns} data={rows} searchPlaceholder="Ism yoki email…" csvFileName="foydalanuvchilar.csv" pageSize={15} />

      <Sheet open={mode !== null} onOpenChange={(o) => !o && setMode(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{mode === "invite" ? "Yangi foydalanuvchi" : editing?.fullName}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 overflow-y-auto px-4 py-2">
            {tempPw && (
              <div className="rounded-lg border border-success/40 bg-success/5 p-3 text-sm">
                <p className="font-medium">Vaqtinchalik parol (faqat hozir koʻrsatiladi):</p>
                <code className="mt-1 block rounded bg-muted px-2 py-1 font-mono text-base">{tempPw}</code>
                <p className="mt-1 text-xs text-muted-foreground">Foydalanuvchiga yetkazing — u qayta koʻrsatilmaydi.</p>
              </div>
            )}

            {mode === "invite" && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label>Email</Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" disabled={!!tempPw} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>To&apos;liq ism</Label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={!!tempPw} />
                </div>
              </>
            )}

            <div className="flex flex-col gap-1.5">
              <Label>Rol</Label>
              <Select value={roleCode} onValueChange={(v) => setRoleCode(v ?? "")} >
                <SelectTrigger disabled={!!tempPw}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {refs.roles.map((r) => (
                    <SelectItem key={r.code} value={r.code}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Sub&apos;ekt kirishi</Label>
              <div className="flex flex-col gap-2 rounded-lg border p-2">
                {refs.entities.map((e) => (
                  <label key={e.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={entityIds.includes(e.id)} onCheckedChange={() => toggleEntity(e.id)} disabled={!!tempPw} />
                    {e.name}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setMode(null)} disabled={pending}>
                {tempPw ? "Yopish" : "Bekor qilish"}
              </Button>
              {!tempPw && (
                <Button onClick={submit} disabled={pending}>
                  <Plus className="size-4" /> {mode === "invite" ? "Taklif qilish" : "Saqlash"}
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
