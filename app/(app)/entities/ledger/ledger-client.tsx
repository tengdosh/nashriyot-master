"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, HandCoins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatUZS } from "@/lib/format";
import { recordSettlementAction } from "../../transfers/actions";

export type LedgerRow = { creditorId: string; creditorName: string; debtorId: string; debtorName: string; amount: number };
export type EntityRef = { id: string; name: string };
type SettlementRow = { id: string; from: string; to: string; amount: number; note: string | null; date: string };

export function LedgerClient({
  rows,
  refs,
  settlements,
  canSettle,
}: {
  rows: LedgerRow[];
  refs: EntityRef[];
  settlements: SettlementRow[];
  canSettle: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);
  const [fromId, setFromId] = React.useState("");
  const [toId, setToId] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [note, setNote] = React.useState("");

  function openFor(row: LedgerRow) {
    // The debtor pays the creditor.
    setFromId(row.debtorId);
    setToId(row.creditorId);
    setAmount(String(row.amount));
    setNote("");
    setOpen(true);
  }

  function save() {
    startTransition(async () => {
      try {
        await recordSettlementAction({ fromEntityId: fromId, toEntityId: toId, amountUZS: Number(amount), note: note || undefined });
        toast.success("Ichki toʻlov qayd etildi");
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Ochiq qoldiqlar</h2>
          {canSettle && (
            <Button variant="outline" size="sm" onClick={() => { setFromId(refs[0]?.id ?? ""); setToId(refs[1]?.id ?? ""); setAmount(""); setNote(""); setOpen(true); }}>
              <HandCoins className="size-4" /> Ichki toʻlov
            </Button>
          )}
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Qarzdor</TableHead>
                <TableHead />
                <TableHead>Kreditor</TableHead>
                <TableHead className="text-right">Qoldiq</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Ochiq qoldiq yoʻq</TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={`${r.debtorId}-${r.creditorId}`}>
                  <TableCell className="font-medium">{r.debtorName}</TableCell>
                  <TableCell><ArrowRight className="size-4 text-muted-foreground" /></TableCell>
                  <TableCell className="font-medium">{r.creditorName}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatUZS(r.amount)}</TableCell>
                  <TableCell className="text-right">
                    {canSettle && (
                      <Button variant="ghost" size="sm" onClick={() => openFor(r)}>
                        <HandCoins className="size-4" /> Toʻlash
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {settlements.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Ichki toʻlovlar tarixi</h2>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sana</TableHead>
                  <TableHead>Toʻlovchi</TableHead>
                  <TableHead>Oluvchi</TableHead>
                  <TableHead className="text-right">Summa</TableHead>
                  <TableHead>Izoh</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settlements.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="tabular-nums">{formatDate(s.date)}</TableCell>
                    <TableCell>{s.from}</TableCell>
                    <TableCell>{s.to}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatUZS(s.amount)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.note ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader><SheetTitle>Ichki toʻlov</SheetTitle></SheetHeader>
          <div className="flex flex-col gap-4 px-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label>Toʻlovchi (qarzdor)</Label>
              <Select value={fromId} onValueChange={(v) => setFromId(v ?? "")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{refs.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Oluvchi (kreditor)</Label>
              <Select value={toId} onValueChange={(v) => setToId(v ?? "")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{refs.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5"><Label>Summa</Label><Input value={amount} inputMode="numeric" onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="flex flex-col gap-1.5"><Label>Izoh</Label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Bekor qilish</Button>
              <Button onClick={save} disabled={pending}>Saqlash</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
