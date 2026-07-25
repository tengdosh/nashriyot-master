"use client";

import * as React from "react";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import type { ContractStatus, ContractType, ContributorRole, ProductFormat } from "@prisma/client";
import { Check, Headphones, Plus, Trash2, X } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { InfoHint } from "@/components/shared/info-hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatNumber, formatUZS } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  activateContractAction,
  checkTiersAction,
  closeContractAction,
  createContractAction,
  updateContractAction,
} from "../royalties/actions";

export type TierRow = {
  id?: string;
  format: string | null;
  fromUnits: number;
  toUnits: number | null;
  rate: number;
  basis: string;
};

export type ContractRow = {
  id: string;
  contributor: string;
  contributorRole: ContributorRole;
  workTitle: string;
  titleId: string | null;
  type: ContractType;
  status: ContractStatus;
  advanceAmount: number;
  advanceOutstanding: number;
  reserveRate: number;
  buyoutAmount: number | null;
  audioRights: boolean;
  statementCount: number;
  totalPaid: number;
  tierProblems: string[];
  tiers: TierRow[];
};

export type ContractRefs = {
  contributors: { id: string; fullName: string; role: ContributorRole }[];
  titles: { id: string; workTitle: string }[];
};

const ANY_FORMAT = "__any__";
const FORMATS: ProductFormat[] = ["HARDCOVER", "PAPERBACK", "EBOOK", "AUDIO"];

type DraftTier = { format: string; fromUnits: string; toUnits: string; rate: string; basis: "LIST" | "NET" };

const emptyTier = (): DraftTier => ({ format: ANY_FORMAT, fromUnits: "0", toUnits: "", rate: "0.1", basis: "LIST" });

export function ContractsClient({
  rows,
  refs,
  canWrite,
}: {
  rows: ContractRow[];
  refs: ContractRefs;
  canWrite: boolean;
}) {
  const [pending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ContractRow | null>(null);

  const [contributorId, setContributorId] = React.useState(refs.contributors[0]?.id ?? "");
  const [titleId, setTitleId] = React.useState(refs.titles[0]?.id ?? "");
  const [type, setType] = React.useState<ContractType>("ROYALTY");
  const [advance, setAdvance] = React.useState("0");
  const [reserve, setReserve] = React.useState("0.15");
  const [buyout, setBuyout] = React.useState("");
  const [audio, setAudio] = React.useState(false);
  const [tiers, setTiers] = React.useState<DraftTier[]>([emptyTier()]);
  const [problems, setProblems] = React.useState<string[]>([]);

  function openNew() {
    setEditing(null);
    setContributorId(refs.contributors[0]?.id ?? "");
    setTitleId(refs.titles[0]?.id ?? "");
    setType("ROYALTY");
    setAdvance("0");
    setReserve("0.15");
    setBuyout("");
    setAudio(false);
    setTiers([
      { format: ANY_FORMAT, fromUnits: "0", toUnits: "2999", rate: "0.08", basis: "LIST" },
      { format: ANY_FORMAT, fromUnits: "3000", toUnits: "", rate: "0.1", basis: "LIST" },
    ]);
    setProblems([]);
    setOpen(true);
  }

  function openEdit(c: ContractRow) {
    setEditing(c);
    setContributorId("");
    setType(c.type);
    setAdvance(String(c.advanceAmount));
    setReserve(String(c.reserveRate));
    setBuyout(c.buyoutAmount != null ? String(c.buyoutAmount) : "");
    setAudio(c.audioRights);
    setTiers(
      c.tiers.length > 0
        ? c.tiers.map((t) => ({
            format: t.format ?? ANY_FORMAT,
            fromUnits: String(t.fromUnits),
            toUnits: t.toUnits != null ? String(t.toUnits) : "",
            rate: String(t.rate),
            basis: (t.basis as "LIST" | "NET") ?? "LIST",
          }))
        : [emptyTier()],
    );
    setProblems(c.tierProblems);
    setOpen(true);
  }

  function toPayload(t: DraftTier) {
    return {
      format: t.format === ANY_FORMAT ? null : t.format,
      fromUnits: Number(t.fromUnits),
      toUnits: t.toUnits === "" ? null : Number(t.toUnits),
      rate: Number(t.rate),
      basis: t.basis,
    };
  }

  /** Validate the ladder on the server so the UI and the engine agree exactly. */
  const revalidateTiers = React.useCallback(
    (next: DraftTier[]) => {
      if (type !== "ROYALTY") {
        setProblems([]);
        return;
      }
      startTransition(async () => {
        try {
          setProblems(await checkTiersAction(next.map(toPayload)));
        } catch {
          // Validation is advisory here; the server re-checks on save.
        }
      });
    },
    [type],
  );

  function setTier(i: number, patch: Partial<DraftTier>) {
    setTiers((ts) => {
      const next = ts.map((t, j) => (j === i ? { ...t, ...patch } : t));
      revalidateTiers(next);
      return next;
    });
  }

  function run(fn: () => Promise<unknown>, success: string) {
    startTransition(async () => {
      try {
        await fn();
        toast.success(success);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  function save() {
    startTransition(async () => {
      try {
        if (editing) {
          await updateContractAction({
            id: editing.id,
            advanceAmount: editing.statementCount > 0 ? undefined : Number(advance),
            reserveRate: Number(reserve),
            buyoutAmount: type === "BUYOUT" && buyout !== "" ? Number(buyout) : undefined,
            audioRights: audio,
            // Tiers may only be re-sent while the contract is still a draft.
            tiers: editing.status === "DRAFT" && type === "ROYALTY" ? tiers.map(toPayload) : undefined,
          });
          toast.success("Shartnoma saqlandi");
        } else {
          await createContractAction({
            contributorId,
            titleId,
            type,
            advanceAmount: Number(advance),
            reserveRate: Number(reserve),
            buyoutAmount: type === "BUYOUT" ? Number(buyout) : null,
            audioRights: audio,
            tiers: type === "ROYALTY" ? tiers.map(toPayload) : [],
          });
          toast.success("Shartnoma yaratildi (qoralama)");
        }
        setOpen(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  const columns = React.useMemo<ColumnDef<ContractRow>[]>(
    () => [
      {
        accessorKey: "contributor",
        header: "Hissador",
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="flex items-center gap-1 font-medium">
              {row.original.contributor}
              {row.original.audioRights && (
                <span title="AUDIO sub-huquqi" className="inline-flex text-muted-foreground">
                  <Headphones className="size-3.5" aria-label="AUDIO sub-huquqi" />
                </span>
              )}
            </span>
            <span className="text-xs text-muted-foreground">{row.original.contributorRole}</span>
          </div>
        ),
      },
      { accessorKey: "workTitle", header: "Asar" },
      {
        accessorKey: "type",
        header: "Turi",
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <StatusBadge
              status={row.original.type}
              tone={row.original.type === "ROYALTY" ? "info" : "muted"}
              label={row.original.type === "ROYALTY" ? "Royalti" : "Bir martalik"}
            />
            {row.original.type === "ROYALTY" && (
              <span className="text-xs text-muted-foreground">{row.original.tiers.length} tier</span>
            )}
          </div>
        ),
      },
      {
        accessorKey: "reserveRate",
        header: "Zaxira",
        cell: ({ row }) =>
          row.original.type === "ROYALTY" ? (
            <span className="flex items-center gap-1 tabular-nums">
              {(row.original.reserveRate * 100).toFixed(0)}%
              <InfoHint>
                Har hisobotda ushlab qolinadi va kelgusi davrda ochiladi — qaytishlar shu zaxiradan
                qoplanadi, muallifdan qaytarib olinmaydi.
              </InfoHint>
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "advanceOutstanding",
        header: "Avans qoldigʻi",
        cell: ({ row }) =>
          row.original.advanceAmount > 0 ? (
            <span className="flex flex-col tabular-nums">
              <span>{formatUZS(row.original.advanceOutstanding)}</span>
              <span className="text-xs text-muted-foreground">
                {formatUZS(row.original.advanceAmount)} dan
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "totalPaid",
        header: "Toʻlangan",
        cell: ({ row }) => (
          <span className="flex flex-col tabular-nums">
            <span>{formatUZS(row.original.totalPaid)}</span>
            <span className="text-xs text-muted-foreground">{row.original.statementCount} hisobot</span>
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Holat",
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <StatusBadge status={row.original.status} />
            {row.original.tierProblems.length > 0 && (
              <span className="text-xs text-destructive">{row.original.tierProblems.length} tier xatosi</span>
            )}
          </div>
        ),
      },
      {
        id: "Amallar",
        header: "",
        cell: ({ row }) =>
          canWrite ? (
            <div className="flex justify-end gap-1">
              <Button variant="ghost" size="sm" onClick={() => openEdit(row.original)}>
                Tahrir
              </Button>
              {row.original.status === "DRAFT" && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => activateContractAction(row.original.id),
                      row.original.type === "BUYOUT"
                        ? "Faollashtirildi — buyout summasi asar xarajatiga yozildi"
                        : "Faollashtirildi",
                    )
                  }
                >
                  <Check className="size-4" />
                </Button>
              )}
              {row.original.status === "ACTIVE" && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => closeContractAction(row.original.id), "Yopildi")}
                >
                  <X className="size-4" />
                </Button>
              )}
            </div>
          ) : null,
      },
    ],
    [canWrite, pending],
  );

  const tiersLocked = editing != null && editing.status !== "DRAFT";

  return (
    <>
      {canWrite && (
        <div>
          <Button onClick={openNew}>
            <Plus className="size-4" /> Yangi shartnoma
          </Button>
        </div>
      )}

      <DataTable
        columns={columns}
        data={rows}
        searchPlaceholder="Hissador yoki asar…"
        csvFileName="shartnomalar.csv"
        pageSize={15}
      />

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{editing ? "Shartnomani tahrirlash" : "Yangi shartnoma"}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 overflow-y-auto px-4 py-2">
            {!editing && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label>Hissador</Label>
                  <Select value={contributorId} onValueChange={(v) => setContributorId(v ?? "")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {refs.contributors.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.fullName} · {c.role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Asar</Label>
                  <Select value={titleId} onValueChange={(v) => setTitleId(v ?? "")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {refs.titles.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.workTitle}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Turi</Label>
                <Select
                  value={type}
                  onValueChange={(v) => {
                    const next = (v as ContractType) ?? "ROYALTY";
                    setType(next);
                    if (next === "BUYOUT") setProblems([]);
                  }}
                >
                  <SelectTrigger disabled={editing != null}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ROYALTY">Royalti (tier dvigateli)</SelectItem>
                    <SelectItem value="BUYOUT">Bir martalik (dvigatelsiz)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {type === "BUYOUT" ? (
                <div className="flex flex-col gap-1.5">
                  <Label>Bir martalik summa</Label>
                  <Input value={buyout} inputMode="numeric" onChange={(e) => setBuyout(e.target.value)} />
                  <p className="text-xs text-muted-foreground">
                    Faollashtirilganda TITLE darajasidagi MUALLIF_BUYOUT xarajatiga yoziladi.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <Label>Zaxira ulushi (0–0.99)</Label>
                  <Input value={reserve} inputMode="decimal" onChange={(e) => setReserve(e.target.value)} />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <Label>Avans</Label>
                <Input
                  value={advance}
                  inputMode="numeric"
                  onChange={(e) => setAdvance(e.target.value)}
                  disabled={editing != null && editing.statementCount > 0}
                />
                {editing != null && editing.statementCount > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Hisobot berilgan — avans summasi qulflangan.
                  </p>
                )}
              </div>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <Checkbox checked={audio} onCheckedChange={(v) => setAudio(!!v)} />
                <span className="inline-flex items-center gap-1">
                  AUDIO sub-huquqi
                  <InfoHint>Audio nashr huquqi shartnomaga kiritilganini belgilaydi (spec §5.6).</InfoHint>
                </span>
              </label>
            </div>

            {type === "ROYALTY" && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label className="inline-flex items-center gap-1">
                    Tier jadvali
                    <InfoHint>
                      Tierlar butun shartnoma umri boʻyicha KUMULYATIV: davr nusxalari umrbod oʻqqa
                      joylashadi. Jadval uzilishsiz va kesishmasdan qoplashi kerak; faqat oxirgi tier ochiq
                      boʻladi.
                    </InfoHint>
                  </Label>
                  {!tiersLocked && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setTiers((ts) => {
                          const last = ts[ts.length - 1];
                          const nextFrom = last?.toUnits ? String(Number(last.toUnits) + 1) : "0";
                          const next = [...ts, { ...emptyTier(), fromUnits: nextFrom }];
                          revalidateTiers(next);
                          return next;
                        })
                      }
                    >
                      <Plus className="size-4" /> Tier
                    </Button>
                  )}
                </div>

                {tiersLocked && (
                  <p className="rounded-md border border-muted p-2 text-xs text-muted-foreground">
                    Faol shartnomaning tier jadvali qulflangan — hisobotlar shu jadval boʻyicha berilgan.
                  </p>
                )}

                {tiers.map((t, i) => (
                  <div key={i} className="grid gap-2 rounded-lg border p-2.5 sm:grid-cols-6">
                    <div className="flex flex-col gap-1 sm:col-span-2">
                      <Label className="text-xs">Format</Label>
                      <Select
                        value={t.format}
                        onValueChange={(v) => setTier(i, { format: v ?? ANY_FORMAT })}
                      >
                        <SelectTrigger disabled={tiersLocked}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ANY_FORMAT}>Barcha formatlar</SelectItem>
                          {FORMATS.map((f) => (
                            <SelectItem key={f} value={f}>
                              {f}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Dan</Label>
                      <Input
                        value={t.fromUnits}
                        inputMode="numeric"
                        disabled={tiersLocked}
                        onChange={(e) => setTier(i, { fromUnits: e.target.value })}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Gacha (bo&apos;sh = ochiq)</Label>
                      <Input
                        value={t.toUnits}
                        inputMode="numeric"
                        disabled={tiersLocked}
                        onChange={(e) => setTier(i, { toUnits: e.target.value })}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Stavka</Label>
                      <Input
                        value={t.rate}
                        inputMode="decimal"
                        disabled={tiersLocked}
                        onChange={(e) => setTier(i, { rate: e.target.value })}
                      />
                    </div>
                    <div className="flex items-end gap-1">
                      <div className="flex flex-1 flex-col gap-1">
                        <Label className="text-xs">Asos</Label>
                        <Select
                          value={t.basis}
                          onValueChange={(v) => setTier(i, { basis: (v as "LIST" | "NET") ?? "LIST" })}
                        >
                          <SelectTrigger disabled={tiersLocked}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="LIST">Asosiy narx</SelectItem>
                            <SelectItem value="NET">Sof narx</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {!tiersLocked && tiers.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setTiers((ts) => {
                              const next = ts.filter((_, j) => j !== i);
                              revalidateTiers(next);
                              return next;
                            })
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}

                {problems.length > 0 && (
                  <ul className="rounded-lg border border-destructive/40 p-2.5 text-xs text-destructive">
                    {problems.map((p, i) => (
                      <li key={i}>• {p}</li>
                    ))}
                  </ul>
                )}
                {problems.length === 0 && tiers.length > 0 && (
                  <p className={cn("text-xs", "text-muted-foreground")}>
                    Tier jadvali toʻgʻri — {formatNumber(tiers.length)} bosqich, uzilish va kesishish yoʻq.
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Bekor qilish
              </Button>
              <Button onClick={save} disabled={pending || (type === "ROYALTY" && problems.length > 0)}>
                Saqlash
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
