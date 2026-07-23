"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Download, Plus, X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/status-badge";
import { MoneyText, MoneyInput } from "@/components/shared/money";
import { EmptyState } from "@/components/shared/states";
import { InfoHint } from "@/components/shared/info-hint";
import { visibleTabs } from "@/lib/title-tabs";
import { isValidIsbn13, formatIsbn13 } from "@/lib/isbn";
import { formatDate } from "@/lib/format";
import { transitionAction, createEditionAction, createProductAction } from "../actions";

const FORMAT_LABEL: Record<string, string> = {
  HARDCOVER: "Qattiq muqova",
  PAPERBACK: "Yumshoq muqova",
  EBOOK: "E-kitob",
  AUDIO: "Audio",
};
const STATUS_LABEL_UZ: Record<string, string> = {
  DRAFT: "Qoralama",
  REVIEW: "Koʻrib chiqish",
  APPROVED: "Tasdiqlangan",
  ACTIVE: "Faol",
  OUT_OF_PRINT: "Chop etilmagan",
};

type Edition = { id: string; editionNo: number; plannedRun: number; status: string; printOrders: number; products: number };
type Product = { id: string; format: string; isbn13: string | null; listPrice: number; editionNo: number | null };
type TitleData = {
  id: string;
  workTitle: string;
  status: string;
  ownerType: "OWN" | "EXTERNAL";
  entityName: string | null;
  ownerPartnerName: string | null;
  seriesName: string | null;
  language: string;
  description: string | null;
  keywords: string[];
  themaCodes: string[];
  bisacCodes: string[];
  uniqueCost: number;
  editions: Edition[];
  products: Product[];
  contributors: { id: string; name: string; role: string }[];
  costEntries: { id: string; category: string; amountUZS: number; date: string }[];
  audit: { id: string; action: string; at: string; user: string; after: Record<string, unknown> | null }[];
};

export function TitleDetail({
  title,
  allowedTransitions,
  canWrite,
  canTransition,
}: {
  title: TitleData;
  allowedTransitions: { to: string; backward: boolean }[];
  canWrite: boolean;
  canTransition: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const tabs = visibleTabs(title.ownerType);
  const [tab, setTab] = React.useState<string>(tabs[0].key);

  // transition reason dialog
  const [reasonOpen, setReasonOpen] = React.useState(false);
  const [reasonTarget, setReasonTarget] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");

  function runTransition(to: string, reasonText?: string) {
    startTransition(async () => {
      try {
        await transitionAction(title.id, to as never, reasonText);
        toast.success(`Holat: ${STATUS_LABEL_UZ[to] ?? to}`);
        setReasonOpen(false);
        setReason("");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  function onTransitionClick(t: { to: string; backward: boolean }) {
    if (t.backward) {
      setReasonTarget(t.to);
      setReasonOpen(true);
    } else {
      runTransition(t.to);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight">{title.workTitle}</h1>
            <StatusBadge status={title.status} />
            <Badge variant="outline">{title.ownerType === "EXTERNAL" ? "Tashqi" : "Oʻz nashri"}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {title.ownerType === "EXTERNAL"
              ? `Egasi: ${title.ownerPartnerName ?? "—"}`
              : `Subʼekt: ${title.entityName ?? "—"}`}
            {title.seriesName ? ` · Seriya: ${title.seriesName}` : ""}
          </p>
        </div>

        {canTransition && allowedTransitions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {allowedTransitions.map((t) => (
              <Button
                key={t.to}
                size="sm"
                variant={t.backward ? "outline" : "default"}
                disabled={pending}
                onClick={() => onTransitionClick(t)}
              >
                {t.backward ? "← " : ""}
                {STATUS_LABEL_UZ[t.to] ?? t.to}
              </Button>
            ))}
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as string)}>
        <TabsList variant="line" className="flex-wrap">
          {tabs.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Umumiy */}
        <TabsContent value="umumiy" className="pt-4">
          <dl className="grid max-w-lg grid-cols-[10rem_1fr] gap-y-2 text-sm">
            <dt className="text-muted-foreground">Til</dt>
            <dd>{title.language}</dd>
            <dt className="text-muted-foreground">Nashrlar</dt>
            <dd>{title.editions.length}</dd>
            <dt className="text-muted-foreground">SKU (formatlar)</dt>
            <dd>{title.products.length}</dd>
            {title.ownerType === "OWN" && (
              <>
                <dt className="flex items-center gap-1 text-muted-foreground">
                  Unikal yuk <InfoHint>TITLE doiradagi cost_entries yigʻindisi (M12 poydevori).</InfoHint>
                </dt>
                <dd className="font-medium">
                  <MoneyText value={title.uniqueCost} />
                </dd>
              </>
            )}
          </dl>
        </TabsContent>

        {/* Nashrlar (OWN only) */}
        {title.ownerType === "OWN" && (
          <TabsContent value="nashrlar" className="pt-4">
            <EditionsPanel title={title} canWrite={canWrite} onDone={() => router.refresh()} />
          </TabsContent>
        )}

        {/* Formatlar */}
        <TabsContent value="formatlar" className="pt-4">
          <FormatsPanel title={title} canWrite={canWrite} onDone={() => router.refresh()} />
        </TabsContent>

        {/* Hissadorlar */}
        <TabsContent value="hissadorlar" className="pt-4">
          {title.contributors.length ? (
            <ul className="flex flex-col gap-1.5 text-sm">
              {title.contributors.map((c) => (
                <li key={c.id} className="flex items-center gap-2">
                  <span className="font-medium">{c.name}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {c.role}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState description="Hissadorlar hali qoʻshilmagan." />
          )}
        </TabsContent>

        {/* Metadata */}
        <TabsContent value="metadata" className="pt-4">
          <div className="flex flex-col gap-3 text-sm">
            <MetaRow label="Kalit soʻzlar" values={title.keywords} />
            <MetaRow label="Thema kodlari" values={title.themaCodes} />
            <MetaRow label="BISAC kodlari" values={title.bisacCodes} />
          </div>
        </TabsContent>

        {/* Annotatsiya */}
        <TabsContent value="annotatsiya" className="pt-4">
          <p className="max-w-2xl text-sm whitespace-pre-wrap text-foreground/90">
            {title.description || <span className="text-muted-foreground">Annotatsiya yoʻq.</span>}
          </p>
        </TabsContent>

        {/* ONIX */}
        <TabsContent value="onix" className="pt-4">
          <OnixPanel titleId={title.id} />
        </TabsContent>

        {/* Xarajatlar (OWN only) */}
        {title.ownerType === "OWN" && (
        <TabsContent value="xarajatlar" className="pt-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Unikal yuk (TITLE jami):</span>
              <span className="text-lg font-semibold">
                <MoneyText value={title.uniqueCost} />
              </span>
              <InfoHint>M12 jonli tan-narx dvigateli shu yigʻindini nusxalarga taqsimlaydi.</InfoHint>
            </div>
            {title.costEntries.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kategoriya</TableHead>
                    <TableHead>Sana</TableHead>
                    <TableHead className="text-right">Summa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {title.costEntries.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>{c.category}</TableCell>
                      <TableCell>{formatDate(c.date)}</TableCell>
                      <TableCell className="text-right">
                        <MoneyText value={c.amountUZS} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState description="TITLE doirasidagi xarajatlar yoʻq (M3 da qoʻshiladi)." />
            )}
          </div>
        </TabsContent>
        )}

        {/* Tarix */}
        <TabsContent value="tarix" className="pt-4">
          {title.audit.length ? (
            <ul className="flex flex-col gap-2 text-sm">
              {title.audit.map((a) => (
                <li key={a.id} className="flex items-start gap-3 border-b pb-2">
                  <Badge variant="outline" className="text-[10px]">
                    {a.action}
                  </Badge>
                  <div className="flex-1">
                    <div className="text-muted-foreground">
                      {formatDate(a.at)} · {a.user}
                    </div>
                    {a.after && (
                      <div className="text-xs text-foreground/80">{JSON.stringify(a.after)}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState description="Tarix boʻsh." />
          )}
        </TabsContent>
      </Tabs>

      {/* Backward transition reason dialog */}
      <Dialog open={reasonOpen} onOpenChange={setReasonOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Orqaga qaytish sababi</DialogTitle>
            <DialogDescription>
              {STATUS_LABEL_UZ[title.status]} → {reasonTarget ? STATUS_LABEL_UZ[reasonTarget] : ""} — sabab majburiy.
            </DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Sabab…" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReasonOpen(false)}>
              <X className="size-4" /> Bekor
            </Button>
            <Button
              disabled={pending || !reason.trim() || !reasonTarget}
              onClick={() => reasonTarget && runTransition(reasonTarget, reason)}
            >
              <Check className="size-4" /> Tasdiqlash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetaRow({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-32 shrink-0 text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1">
        {values.length ? (
          values.map((v) => (
            <Badge key={v} variant="secondary" className="text-[10px]">
              {v}
            </Badge>
          ))
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
    </div>
  );
}

function EditionsPanel({
  title,
  canWrite,
  onDone,
}: {
  title: TitleData;
  canWrite: boolean;
  onDone: () => void;
}) {
  const [pending, startTransition] = React.useTransition();
  const [plannedRun, setPlannedRun] = React.useState(3000);

  function addEdition() {
    startTransition(async () => {
      try {
        const ed = await createEditionAction(title.id, plannedRun);
        toast.success(`${ed.editionNo}-nashr qoʻshildi`);
        onDone();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {title.editions.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nashr</TableHead>
              <TableHead>Reja tiraji</TableHead>
              <TableHead>Holat</TableHead>
              <TableHead>Print orderlar</TableHead>
              <TableHead>SKU</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {title.editions.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{e.editionNo}-nashr</TableCell>
                <TableCell>{e.plannedRun.toLocaleString("ru-RU")}</TableCell>
                <TableCell>
                  <StatusBadge status={e.status} />
                </TableCell>
                <TableCell>{e.printOrders}</TableCell>
                <TableCell>{e.products}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <EmptyState description="Nashrlar hali yoʻq." />
      )}

      {canWrite && (
        <div className="flex items-end gap-2 border-t pt-3">
          <div className="flex flex-col gap-1.5">
            <Label>Reja tiraji</Label>
            <Input
              type="number"
              className="w-40"
              value={plannedRun}
              onChange={(e) => setPlannedRun(Number(e.target.value))}
            />
          </div>
          <Button onClick={addEdition} disabled={pending || plannedRun <= 0}>
            <Plus className="size-4" /> Yangi nashr
          </Button>
        </div>
      )}
    </div>
  );
}

function FormatsPanel({
  title,
  canWrite,
  onDone,
}: {
  title: TitleData;
  canWrite: boolean;
  onDone: () => void;
}) {
  const [pending, startTransition] = React.useTransition();
  const [format, setFormat] = React.useState("PAPERBACK");
  const [editionId, setEditionId] = React.useState<string>(title.editions[0]?.id ?? "");
  const [isbn, setIsbn] = React.useState("");
  const [price, setPrice] = React.useState(0);
  const isbnOk = !isbn || isValidIsbn13(isbn);

  function addSku() {
    if (isbn && !isValidIsbn13(isbn)) {
      toast.error("ISBN-13 notoʻgʻri");
      return;
    }
    startTransition(async () => {
      try {
        await createProductAction({
          titleId: title.id,
          editionId: editionId || null,
          format,
          isbn13: isbn || null,
          listPrice: price,
          vatRate: 0,
        });
        toast.success("SKU qoʻshildi");
        setIsbn("");
        setPrice(0);
        onDone();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Xatolik");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {title.products.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Format</TableHead>
              <TableHead>ISBN-13</TableHead>
              <TableHead>Nashr</TableHead>
              <TableHead className="text-right">Narx</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {title.products.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{FORMAT_LABEL[p.format] ?? p.format}</TableCell>
                <TableCell className="font-mono text-xs">
                  {p.isbn13 ? formatIsbn13(p.isbn13) : "—"}
                </TableCell>
                <TableCell>{p.editionNo ? `${p.editionNo}-nashr` : "—"}</TableCell>
                <TableCell className="text-right">
                  <MoneyText value={p.listPrice} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <EmptyState description="SKU (formatlar) hali yoʻq." />
      )}

      {canWrite && (
        <div className="grid gap-3 border-t pt-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Format</Label>
            <Select value={format} onValueChange={(v) => setFormat(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(FORMAT_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {title.ownerType === "OWN" && title.editions.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label>Nashr (edition)</Label>
              <Select value={editionId} onValueChange={(v) => setEditionId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {title.editions.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.editionNo}-nashr
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label>ISBN-13</Label>
            <Input
              value={isbn}
              onChange={(e) => setIsbn(e.target.value)}
              placeholder="978…"
              aria-invalid={!isbnOk}
              className="font-mono"
            />
            {!isbnOk && <span className="text-xs text-destructive">Nazorat raqami mos emas</span>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Narx</Label>
            <MoneyInput value={price} onValueChange={setPrice} />
          </div>
          <div>
            <Button onClick={addSku} disabled={pending || !isbnOk || price <= 0}>
              <Plus className="size-4" /> SKU qoʻshish
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function OnixPanel({ titleId }: { titleId: string }) {
  const [xml, setXml] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function preview() {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/titles/${titleId}/onix`);
      setXml(await res.text());
    } catch {
      toast.error("ONIX yuklab boʻlmadi");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={preview} disabled={loading}>
          {loading ? "…" : "Koʻrish"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          render={<a href={`/api/v1/titles/${titleId}/onix`} download={`onix-${titleId}.xml`} />}
        >
          <Download className="size-4" /> Yuklab olish (ONIX 3.0)
        </Button>
      </div>
      {xml && (
        <pre className="max-h-96 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs">
          {xml}
        </pre>
      )}
    </div>
  );
}
